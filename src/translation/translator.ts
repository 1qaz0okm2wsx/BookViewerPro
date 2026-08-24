/** 上下文翻译：LLM 优先（Ollama / OpenAI 兼容），MyMemory 免费接口兜底；段落级 IndexedDB 缓存 */
import { get, set } from "idb-keyval";
import { chat, detectLang, loadLlmSettings, type LlmSettings } from "../ai/llm";

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

const cacheKey = (text: string) => `bv:tr:${hash(text)}`;

async function myMemory(text: string, from: string, to: string): Promise<string> {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 450))}&langpair=${from}|${to}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MyMemory ${res.status}`);
  const data = (await res.json()) as { responseData?: { translatedText?: string } };
  const out = data.responseData?.translatedText;
  if (!out || /NO QUERY SPECIFIED|INVALID/i.test(out)) throw new Error("MyMemory 无结果");
  return out;
}

async function viaLlm(settings: LlmSettings, text: string, target: "zh" | "en"): Promise<string> {
  const targetLabel = target === "zh" ? "简体中文" : "英文";
  const answer = await chat(settings, [
    {
      role: "system",
      content: `你是专业文学翻译。把用户给出的段落翻译成流畅的${targetLabel}，保留原意、语气与段落结构，只输出译文，不加任何解释。`,
    },
    { role: "user", content: text },
  ]);
  return answer.trim();
}

export interface TranslateOpts {
  settings?: LlmSettings;
  force?: boolean;
}

/** 翻译一段文本（带缓存）。中文 → 英文；其他 → 简体中文。 */
export async function translate(text: string, opts?: TranslateOpts): Promise<string> {
  const clean = text.trim();
  if (!clean) return "";
  const key = cacheKey(clean);
  if (!opts?.force) {
    const hit = await get<string>(key);
    if (hit) return hit;
  }
  const source = detectLang(clean);
  const target: "zh" | "en" = source === "zh" ? "en" : "zh";
  const settings = opts?.settings ?? loadLlmSettings();

  let out = "";
  try {
    out = await viaLlm(settings, clean, target);
  } catch {
    // LLM 不可用 → 免费接口兜底（长段切分）
    const pair = source === "zh" ? ["zh-CN", "en"] : ["en", "zh-CN"];
    const srcParts: string[] = [];
    for (let i = 0; i < clean.length; i += 420) srcParts.push(clean.slice(i, i + 420));
    const trParts: string[] = [];
    for (const part of srcParts) trParts.push(await myMemory(part, pair[0], pair[1]));
    out = trParts.join(" ");
  }
  if (!out) throw new Error("翻译失败：LLM 与在线接口均不可用");
  await set(key, out);
  return out;
}

/** 批量翻译（顺序执行、可中止、带进度），返回与输入等长的译文数组 */
export async function translateBatch(
  texts: string[],
  onProgress: (done: number, total: number) => void,
  isCancelled: () => boolean,
  opts?: TranslateOpts,
): Promise<string[]> {
  const out: string[] = new Array(texts.length).fill("");
  for (let i = 0; i < texts.length; i++) {
    if (isCancelled()) break;
    onProgress(i, texts.length);
    try {
      out[i] = await translate(texts[i], opts);
    } catch (e) {
      out[i] = `（翻译失败：${e instanceof Error ? e.message : "未知错误"}）`;
    }
  }
  onProgress(texts.length, texts.length);
  return out;
}
