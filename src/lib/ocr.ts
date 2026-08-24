import { createWorker } from "tesseract.js";
import type { Worker } from "tesseract.js";
import { loadJSON, saveJSON } from "./idb";
import type { OcrPageResult, OcrWord } from "../types";

let workerPromise: Promise<Worker> | null = null;
let activeStatusFn: OcrStatusFn | undefined;

export type OcrStatusFn = (m: { status: string; progress: number }) => void;

/**
 * tesseract.js 单例 Worker。
 * 语言包（chi_sim + eng）首次使用时由 tesseract.js 自动下载并缓存于浏览器，
 * 之后可离线使用。进度回调通过可变引用转发，支持每次识别独立上报。
 */
export function getOcrWorker(onStatus?: OcrStatusFn): Promise<Worker> {
  if (onStatus) activeStatusFn = onStatus;
  if (!workerPromise) {
    workerPromise = createWorker(["chi_sim", "eng"], 1, {
      logger: (m: { status: string; progress: number }) => activeStatusFn?.(m),
    }).catch((e) => {
      workerPromise = null;
      throw e;
    });
  }
  return workerPromise;
}

/** 读取图片尺寸 */
function imageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 1, height: img.naturalHeight || 1 });
    img.onerror = () => reject(new Error("图片解码失败"));
    img.src = src;
  });
}

/**
 * 识别一张图片（dataURL），返回全文 + 每个词的像素坐标框。
 */
export async function recognizeImage(
  src: string,
  page: number,
  onProgress?: (p: number, status: string) => void,
): Promise<OcrPageResult> {
  const worker = await getOcrWorker((m) => {
    if (m.status === "recognizing text") onProgress?.(m.progress, "正在识别文字");
    else if (m.status.includes("loading")) onProgress?.(m.progress * 0.5, "正在加载语言包（首次需联网下载）");
    else if (m.status.includes("initializing")) onProgress?.(m.progress * 0.3, "正在初始化 OCR 引擎");
  });
  const { width, height } = await imageSize(src);
  const { data } = await worker.recognize(src);
  const rawWords = (data as unknown as {
    words?: Array<{ text?: string; bbox: { x0: number; y0: number; x1: number; y1: number } }>;
  }).words ?? [];
  const words: OcrWord[] = [];
  for (const w of rawWords) {
    const text = (w.text ?? "").trim();
    if (!text) continue;
    const b = w.bbox;
    words.push({
      text,
      x: Math.max(0, b.x0),
      y: Math.max(0, b.y0),
      w: Math.max(1, b.x1 - b.x0),
      h: Math.max(1, b.y1 - b.y0),
    });
  }
  return { page, width, height, text: data.text ?? "", words };
}

/* ---------- OCR 结果缓存（按书聚合，存 IndexedDB） ---------- */

const ocrKey = (bookId: string) => `bv:ocr:${bookId}`;

export async function getOcrMap(bookId: string): Promise<Record<string, OcrPageResult>> {
  return (await loadJSON<Record<string, OcrPageResult>>(ocrKey(bookId), {})) ?? {};
}

export async function saveOcrPage(bookId: string, result: OcrPageResult): Promise<void> {
  const map = await getOcrMap(bookId);
  map[String(result.page)] = result;
  await saveJSON(ocrKey(bookId), map);
}

export async function deleteOcr(bookId: string): Promise<void> {
  const { del } = await import("./idb");
  await del(ocrKey(bookId));
}
