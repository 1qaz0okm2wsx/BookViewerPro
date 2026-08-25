/** 轻量级 RAG：书籍分块 → 向量化（@xenova/transformers，浏览器端）→ 余弦检索 */
import type { ParsedBook } from "../types";
import { stripHtml } from "../lib/parse";
import { loadBookStore, saveBookStore, delBookStore } from "../db/BookDB";

export interface Chunk {
  bookId: string;
  chapterId: string;
  chapterTitle: string;
  text: string;
  idx: number;
}

/** 将全书切分为带章节归属的文本块（约 350 字，60 字重叠） */
export function chunkBook(bookId: string, parsed: ParsedBook): Chunk[] {
  const chunks: Chunk[] = [];
  parsed.chapters.forEach((ch) => {
    const text = stripHtml(ch.html).replace(/\s+/g, " ").trim();
    if (!text) return;
    const size = 350;
    const overlap = 60;
    for (let i = 0; i < text.length; i += size - overlap) {
      const piece = text.slice(i, i + size).trim();
      if (piece.length > 20) {
        chunks.push({ bookId, chapterId: ch.id, chapterTitle: ch.title, text: piece, idx: chunks.length });
      }
    }
  });
  return chunks;
}

/* ---------------- 向量嵌入（惰性加载模型） ---------------- */

type Pipe = (texts: string[], opts?: Record<string, unknown>) => Promise<{ data: Float32Array; dims: number }>;
let pipePromise: Promise<Pipe> | null = null;
let modelFailed = false;

export function getEmbedder(onStage?: (s: string) => void): Promise<Pipe> {
  if (!pipePromise) {
    pipePromise = (async () => {
      onStage?.("正在加载嵌入模型（首次约 20MB，来自 HuggingFace CDN）…");
      // 通过 CDN 动态加载，避免 onnxruntime-web 进入构建产物（体积过大）
      const mod = (await import(
        /* @vite-ignore */ "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2"
      )) as unknown as {
        pipeline: (task: string, model: string, opts?: Record<string, unknown>) => Promise<Pipe>;
        env: Record<string, unknown>;
      };
      mod.env.allowLocalModels = false;
      const p = await mod.pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", { quantized: true });
      return p;
    })().catch((e) => {
      modelFailed = true;
      pipePromise = null;
      throw e;
    });
  }
  return pipePromise;
}

export async function embedTexts(
  texts: string[],
  onStage?: (s: string) => void,
): Promise<number[][]> {
  const pipe = await getEmbedder(onStage);
  const out: number[][] = [];
  const batch = 16;
  for (let i = 0; i < texts.length; i += batch) {
    const part = texts.slice(i, i + batch);
    onStage?.(`正在向量化 ${Math.min(i + batch, texts.length)} / ${texts.length} 段…`);
    const res = await pipe(part, { pooling: "mean", normalize: true });
    for (let r = 0; r < part.length; r++) {
      out.push(Array.from(res.data.slice(r * res.dims, (r + 1) * res.dims)));
    }
  }
  return out;
}

export async function embedQuery(text: string): Promise<number[] | null> {
  if (modelFailed) return null;
  try {
    const [v] = await embedTexts([text.slice(0, 500)]);
    return v;
  } catch {
    return null;
  }
}

/* ---------------- 检索 ---------------- */

function cosine(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** 中文按字二元组、英文按词的关键词评分（离线兜底） */
export function keywordScore(query: string, text: string): number {
  const terms: string[] = [];
  const q = query.toLowerCase();
  const enWords = q.match(/[a-z0-9]+/g) ?? [];
  terms.push(...enWords);
  const cjk = q.replace(/[^\u4e00-\u9fff]/g, "");
  for (let i = 0; i < cjk.length - 1; i++) terms.push(cjk.slice(i, i + 2));
  for (const ch of cjk) terms.push(ch);
  if (!terms.length) return 0;
  let score = 0;
  for (const t of terms) {
    let idx = text.indexOf(t);
    while (idx !== -1 && score < 999) {
      score += t.length > 1 ? 2 : 1;
      idx = text.indexOf(t, idx + t.length);
    }
  }
  return score;
}

export interface SearchIndex {
  chunks: Chunk[];
  vectors: number[][] | null;
  mode: "vector" | "keyword";
}

export async function buildIndex(
  bookId: string,
  parsed: ParsedBook,
  onStage?: (s: string) => void,
): Promise<SearchIndex> {
  const chunks = chunkBook(bookId, parsed);
  if (!chunks.length) throw new Error("该书没有可索引的文本");
  try {
    const vectors = await embedTexts(chunks.map((c) => c.text), onStage);
    onStage?.(`向量索引构建完成（${chunks.length} 段）`);
    return { chunks, vectors, mode: "vector" };
  } catch {
    onStage?.(`嵌入模型不可用，已切换为本地关键词索引（${chunks.length} 段）`);
    return { chunks, vectors: null, mode: "keyword" };
  }
}

/* ---------------- 向量持久化（每书一库 · embeddings 表） ---------------- */

interface PersistedIndex {
  chunks: Chunk[];
  vectors: number[][];
  fingerprint: string;
}

/** 用分块数量与首尾块文本生成指纹，内容变化时自动失效旧向量 */
function fingerprintOf(chunks: Chunk[]): string {
  const first = chunks[0]?.text.slice(0, 40) ?? "";
  const last = chunks[chunks.length - 1]?.text.slice(0, 40) ?? "";
  return `${chunks.length}|${first}|${last}`;
}

export async function saveIndex(bookId: string, index: SearchIndex): Promise<void> {
  if (index.mode !== "vector" || !index.vectors) return;
  await saveBookStore<PersistedIndex>(bookId, "embeddings", {
    chunks: index.chunks,
    vectors: index.vectors,
    fingerprint: fingerprintOf(index.chunks),
  });
}

/** 命中缓存则直接返回向量索引，避免重复嵌入；内容已变则返回 null */
export async function loadIndex(bookId: string, parsed: ParsedBook): Promise<SearchIndex | null> {
  const stored = await loadBookStore<PersistedIndex>(bookId, "embeddings");
  if (!stored || !stored.vectors?.length) return null;
  const chunks = chunkBook(bookId, parsed);
  if (fingerprintOf(chunks) !== stored.fingerprint) {
    await delBookStore(bookId, "embeddings");
    return null;
  }
  return { chunks, vectors: stored.vectors, mode: "vector" };
}

export function searchIndex(index: SearchIndex, query: string, qVec: number[] | null, k = 4): Chunk[] {
  const scored = index.chunks.map((c, i) => {
    let s: number;
    if (index.vectors && qVec) s = cosine(qVec, index.vectors[i]) * 10;
    else s = keywordScore(query, c.text);
    return { c, s };
  });
  scored.sort((a, b) => b.s - a.s);
  return scored.filter((x) => x.s > 0.01).slice(0, k).map((x) => x.c);
}
