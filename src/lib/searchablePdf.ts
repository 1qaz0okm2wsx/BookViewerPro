import { PDFDocument, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { loadJSON, saveJSON } from "./idb";
import type { OcrPageResult } from "../types";

export interface SearchablePage {
  imageDataUrl: string;
  ocr: OcrPageResult;
}

const FONT_CACHE_KEY = "bv:font:notosanssc";
const FONT_CDN =
  "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/SubsetOTF/SC/NotoSansSC-Regular.otf";

let fontBytesPromise: Promise<Uint8Array | null> | null = null;

/** 获取 Noto Sans SC 字体字节（IndexedDB 缓存，首次联网下载） */
function getCjkFont(onStage?: (s: string) => void): Promise<Uint8Array | null> {
  if (!fontBytesPromise) {
    fontBytesPromise = (async () => {
      const cached = await loadJSON<string>(FONT_CACHE_KEY, "");
      if (cached) {
        const bin = atob(cached);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
      }
      onStage?.("正在下载中文字体子集源（首次约 10MB，将缓存到本地）…");
      try {
        const resp = await fetch(FONT_CDN);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const buf = new Uint8Array(await resp.arrayBuffer());
        // 缓存（base64 分块，避免一次性大字符串卡顿）
        let b64 = "";
        const CHUNK = 0x8000;
        for (let i = 0; i < buf.length; i += CHUNK) {
          b64 += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + CHUNK)));
        }
        await saveJSON(FONT_CACHE_KEY, btoa(b64));
        return buf;
      } catch (e) {
        console.warn("CJK 字体下载失败，将仅嵌入 ASCII 文本层", e);
        return null;
      }
    })();
  }
  return fontBytesPromise;
}

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; png: boolean } {
  const m = /^(image\/(png|jpeg));base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error("图片数据格式无效");
  const bin = atob(m[3]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, png: m[2] === "png" };
}

const asciiOnly = (s: string) => s.replace(/[^\x20-\xFF]/g, "");

/**
 * 将「扫描页图片 + OCR 词框」合成为带隐藏文本层的可搜索 PDF。
 * - 文本以 opacity 0 绘制，视觉上不可见，但可被选择、搜索、复制；
 * - 中文字体通过 fontkit 子集嵌入（仅包含用到的字形）；
 * - 字体不可用时退化为 ASCII 文本层。
 */
export async function buildSearchablePdf(
  pages: SearchablePage[],
  title: string,
  onStage?: (s: string) => void,
): Promise<{ blob: Blob; cjk: boolean }> {
  const stage = onStage ?? (() => {});
  if (!pages.length) throw new Error("没有已识别的页面");

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  pdfDoc.setTitle(title);
  pdfDoc.setProducer("墨阁 BookViewer Pro");

  stage("正在准备中文字体…");
  const cjkBytes = await getCjkFont(stage);
  let cjk = false;
  let font;
  if (cjkBytes) {
    try {
      font = await pdfDoc.embedFont(cjkBytes, { subset: true });
      cjk = true;
    } catch (e) {
      console.warn("CJK 字体嵌入失败，退化为 ASCII", e);
    }
  }
  if (!font) font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    stage(`正在写入第 ${i + 1}/${pages.length} 页文本层…`);
    const { bytes, png } = dataUrlToBytes(p.imageDataUrl);
    const img = png ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
    const pw = p.ocr.width || img.width;
    const ph = p.ocr.height || img.height;
    const page = pdfDoc.addPage([pw, ph]);
    page.drawImage(img, { x: 0, y: 0, width: pw, height: ph });

    for (const w of p.ocr.words) {
      let text = w.text;
      if (!cjk) {
        text = asciiOnly(text);
        if (!text.trim()) continue;
      }
      const size = Math.max(5, w.h * 0.82);
      const y = ph - (w.y + w.h) + w.h * 0.14;
      try {
        page.drawText(text, { x: w.x, y, size, font, opacity: 0 });
      } catch {
        const t = asciiOnly(text);
        if (t.trim()) page.drawText(t, { x: w.x, y, size, font, opacity: 0 });
      }
    }
  }

  const pdfBytes = await pdfDoc.save();
  return {
    blob: new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" }),
    cjk,
  };
}
