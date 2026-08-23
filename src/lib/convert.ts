import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import TurndownService from "turndown";
import { buildEpub } from "./epub";
import { parseBook, stripHtml, getCbzImage, getCbzImageList, readAsDataUrl } from "./parse";
import pdfjs from "./pdf";
import type { BookFormat, BookMeta, ParsedBook, ParsedChapter } from "../types";

export interface ConvertTarget {
  key: string;
  label: string;
  ext: string;
}

export interface ConvertResult {
  blob: Blob;
  filename: string;
  format: string;
}

const T = (key: string, label: string, ext: string): ConvertTarget => ({ key, label, ext });

/** 依据源格式返回可转换的目标格式 */
export function targetsFor(format: BookFormat): ConvertTarget[] {
  switch (format) {
    case "epub": return [T("epub3", "EPUB 3.0", "epub"), T("epub2", "EPUB 2.0", "epub"), T("html", "单文件 HTML", "html"), T("pdf", "PDF 文档", "pdf"), T("docx", "Word 文档", "docx"), T("txt", "纯文本", "txt")];
    case "docx": return [T("html", "单文件 HTML", "html"), T("pdf", "PDF 文档", "pdf"), T("epub3", "EPUB 3.0", "epub"), T("md", "Markdown", "md"), T("txt", "纯文本", "txt")];
    case "txt": return [T("docx", "Word 文档", "docx"), T("pdf", "PDF 文档", "pdf"), T("epub3", "EPUB 3.0", "epub"), T("html", "单文件 HTML", "html"), T("md", "Markdown", "md")];
    case "md": return [T("html", "单文件 HTML", "html"), T("docx", "Word 文档", "docx"), T("pdf", "PDF 文档", "pdf"), T("epub3", "EPUB 3.0", "epub"), T("txt", "纯文本", "txt")];
    case "html": return [T("md", "Markdown", "md"), T("docx", "Word 文档", "docx"), T("pdf", "PDF 文档", "pdf"), T("epub3", "EPUB 3.0", "epub"), T("txt", "纯文本", "txt")];
    case "fb2": return [T("html", "单文件 HTML", "html"), T("pdf", "PDF 文档", "pdf"), T("epub3", "EPUB 3.0", "epub"), T("docx", "Word 文档", "docx"), T("txt", "纯文本", "txt")];
    case "mobi": return [T("html", "单文件 HTML", "html"), T("pdf", "PDF 文档", "pdf"), T("epub3", "EPUB 3.0", "epub"), T("txt", "纯文本", "txt")];
    case "pdf": return [T("txt", "提取文本 TXT", "txt")];
    case "svg": return [T("png", "PNG 位图（2×）", "png")];
    case "image": return [T("svg", "SVG 封装", "svg")];
    case "cbz": return [T("pdf", "PDF 画册", "pdf")];
    default: return [];
  }
}

/* ---------------- 中间产物 ---------------- */

function chaptersToText(chapters: ParsedChapter[]): string {
  return chapters
    .map((c) => `${chapters.length > 1 ? `■ ${c.title}\n\n` : ""}${stripHtml(c.html).replace(/\n{3,}/g, "\n\n").trim()}`)
    .join("\n\n\n");
}

function chaptersToHtmlDoc(title: string, author: string, chapters: ParsedChapter[]): string {
  const toc = chapters.length > 1
    ? `<nav class="toc"><h2>目录</h2><ol>${chapters.map((c, i) => `<li><a href="#ch${i}">${c.title}</a></li>`).join("")}</ol></nav>`
    : "";
  const body = chapters
    .map((c, i) => `<section id="ch${i}">${chapters.length > 1 ? `<h2>${c.title}</h2>` : ""}${c.html}</section>`)
    .join("\n");
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="generator" content="墨阁 BookViewer Pro"/>
<title>${title}</title>
<style>
  body{font-family:"Noto Serif SC","Songti SC",serif;max-width:46em;margin:0 auto;padding:3em 1.4em;color:#2a322e;line-height:1.9;background:#fcfbf6}
  header{text-align:center;border-bottom:1px solid #ded9ca;padding-bottom:1.6em;margin-bottom:2em}
  h1{font-size:2em;letter-spacing:.06em;margin:.2em 0}
  .author{color:#8a948c}
  .toc ol{columns:2}
  a{color:#c6431f}
  img{max-width:100%}
  blockquote{border-left:3px solid #c89b3c;padding-left:1em;color:#6b7280}
  footer{margin-top:3em;padding-top:1em;border-top:1px solid #ded9ca;color:#8a948c;font-size:.85em;text-align:center}
</style>
</head>
<body>
<header><h1>${title}</h1><p class="author">${author}</p></header>
${toc}
${body}
<footer>由 墨阁 BookViewer Pro 于本地转换生成 · ${new Date().toLocaleDateString("zh-CN")}</footer>
</body>
</html>`;
}

async function chaptersToDocxBlob(title: string, author: string, chapters: ParsedChapter[]): Promise<Blob> {
  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: title, bold: true, size: 44 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 480 },
      children: [new TextRun({ text: author || "—", size: 22, color: "8A948C" })],
    }),
  ];
  chapters.forEach((ch) => {
    if (chapters.length > 1) {
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 420, after: 200 },
        children: [new TextRun({ text: ch.title, bold: true, size: 32 })],
      }));
    }
    stripHtml(ch.html)
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((p) => {
        children.push(new Paragraph({
          spacing: { after: 140, line: 380 },
          children: [new TextRun({ text: p, size: 24 })],
        }));
      });
  });
  const doc = new Document({
    creator: "墨阁 BookViewer Pro",
    title,
    sections: [{ properties: {}, children }],
  });
  return Packer.toBlob(doc);
}

/** 将任意 HTML 片段转为 DOCX（供编辑器另存使用） */
export async function htmlToDocxBlob(title: string, author: string, html: string): Promise<Blob> {
  const holder = document.createElement("div");
  holder.innerHTML = html;
  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 480 },
      children: [new TextRun({ text: title, bold: true, size: 44 })],
    }),
  ];
  const walk = (root: Element) => {
    Array.from(root.children).forEach((el) => {
      const tag = el.tagName;
      const text = (el.textContent ?? "").trim();
      if (tag === "H1") children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 420, after: 200 }, children: [new TextRun({ text, bold: true, size: 34 })] }));
      else if (tag === "H2") children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 320, after: 160 }, children: [new TextRun({ text, bold: true, size: 30 })] }));
      else if (tag === "H3") children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 260, after: 140 }, children: [new TextRun({ text, bold: true, size: 27 })] }));
      else if (/^(P|LI|BLOCKQUOTE|TD|TH)$/.test(tag) && text) children.push(new Paragraph({ spacing: { after: 140, line: 380 }, children: [new TextRun({ text, size: 24 })] }));
      else if (/^(UL|OL|DIV|SECTION|ARTICLE|TABLE|TBODY|THEAD|TR|NAV)$/.test(tag)) walk(el);
      else if (text) children.push(new Paragraph({ spacing: { after: 140, line: 380 }, children: [new TextRun({ text, size: 24 })] }));
    });
  };
  walk(holder);
  const doc = new Document({ creator: "墨阁 BookViewer Pro", title, sections: [{ properties: {}, children }] });
  return Packer.toBlob(doc);
}

/** 将 HTML 渲染为 A4 多页 PDF（离屏 iframe + html2canvas 光栅化，原生支持中文） */
async function htmlToPdfBlob(html: string, title: string): Promise<Blob> {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;left:-12000px;top:0;width:794px;height:1123px;border:0;visibility:hidden";
  document.body.appendChild(iframe);
  const docHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:#ffffff}
    body{font-family:"Noto Serif SC","Songti SC","SimSun",serif;color:#222;line-height:1.85;padding:64px 70px;width:654px}
    h1{font-size:26px;text-align:center;letter-spacing:2px}
    h2{font-size:20px;margin:1.4em 0 .6em;border-bottom:1px solid #ddd;padding-bottom:.3em}
    h3{font-size:17px}
    p{margin:.55em 0;text-align:justify}
    img{max-width:100%}
    blockquote{border-left:3px solid #c89b3c;margin:1em 0;padding-left:1em;color:#555}
    .pdf-meta{color:#999;font-size:12px;text-align:center;margin-bottom:2em}
    code{font-family:monospace;background:#f0f0f0;padding:1px 4px}
    pre{background:#f5f5f5;padding:10px;overflow:hidden}
  </style></head><body>
  <h1>${title}</h1>
  <p class="pdf-meta">墨阁 BookViewer Pro 本地转换 · ${new Date().toLocaleDateString("zh-CN")}</p>
  ${html}
  </body></html>`;
  iframe.srcdoc = docHtml;
  await new Promise<void>((resolve) => {
    iframe.onload = () => resolve();
    window.setTimeout(resolve, 1500);
  });
  try {
    const body = iframe.contentDocument?.body;
    if (!body) throw new Error("无法创建渲染环境");
    const canvas = await html2canvas(body, { scale: 2, backgroundColor: "#ffffff", logging: false });
    const pdf = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });
    const pageW = 595.28;
    const pageH = 841.89;
    const pxPerPt = canvas.width / pageW;
    const sliceH = Math.floor(pageH * pxPerPt);
    let y = 0;
    let page = 0;
    while (y < canvas.height) {
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = Math.min(sliceH, canvas.height - y);
      const ctx = slice.getContext("2d");
      if (!ctx) throw new Error("画布初始化失败");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, y, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
      if (page > 0) pdf.addPage();
      pdf.addImage(slice.toDataURL("image/jpeg", 0.88), "JPEG", 0, 0, pageW, slice.height / pxPerPt);
      page++;
      y += sliceH;
    }
    return pdf.output("blob");
  } finally {
    iframe.remove();
  }
}

async function pdfToText(data: ArrayBuffer): Promise<string> {
  const task = pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) });
  const doc = await task.promise;
  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    parts.push(tc.items.map((it) => ("str" in it ? it.str : "")).join(""));
  }
  try { await task.destroy(); } catch { /* ignore */ }
  return parts.join("\n\n");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("图片加载失败"));
    img.src = src;
  });
}

async function svgToPngBlob(blob: Blob): Promise<Blob> {
  const url = await readAsDataUrl(blob);
  const img = await loadImage(url);
  const w = img.naturalWidth || 1024;
  const h = img.naturalHeight || 1024;
  const canvas = document.createElement("canvas");
  canvas.width = w * 2;
  canvas.height = h * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画布初始化失败");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG 编码失败"))), "image/png"));
}

async function imageToSvgBlob(blob: Blob): Promise<Blob> {
  const url = await readAsDataUrl(blob);
  const img = await loadImage(url);
  const w = img.naturalWidth || 800;
  const h = img.naturalHeight || 600;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <image width="${w}" height="${h}" xlink:href="${url}"/>
</svg>`;
  return new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
}

async function cbzToPdfBlob(bookId: string): Promise<Blob> {
  const names = getCbzImageList(bookId);
  if (!names.length) throw new Error("请先在阅读器中打开该漫画一次，再执行转换");
  // 首图决定页面比例
  const first = await loadImage(await getCbzImage(bookId, 0));
  const fw = first.naturalWidth || 3;
  const fh = first.naturalHeight || 4;
  const pw = 595.28;
  const ph = (pw * fh) / fw;
  const pdf = new jsPDF({ orientation: fh > fw ? "p" : "l", unit: "pt", format: [pw, ph] });
  const limit = Math.min(names.length, 200);
  for (let i = 0; i < limit; i++) {
    const data = await getCbzImage(bookId, i);
    const img = await loadImage(data);
    const w = img.naturalWidth || fw;
    const h = img.naturalHeight || fh;
    const pageW = 595.28;
    const pageH = (pageW * h) / w;
    if (i > 0) pdf.addPage([pageW, pageH], h > w ? "p" : "l");
    pdf.addImage(data, "JPEG", 0, 0, pageW, pageH);
  }
  return pdf.output("blob");
}

/* ---------------- 主入口 ---------------- */

export async function convertFile(
  meta: BookMeta,
  blob: Blob,
  targetKey: string,
  onStage?: (stage: string) => void,
): Promise<ConvertResult> {
  const stage = onStage ?? (() => {});
  const baseName = (meta.title || "document").replace(/[\\/:*?"<>|]/g, "_").slice(0, 60);
  const target = targetsFor(meta.format).find((t) => t.key === targetKey);
  if (!target) throw new Error("该源格式暂不支持此目标格式");

  const needChapters =
    !["pdf", "svg", "image", "cbz"].includes(meta.format) ||
    ["epub2", "epub3", "pdf", "docx", "html", "txt", "md"].includes(targetKey);

  let parsed: ParsedBook | null = null;
  if (needChapters) {
    stage("正在解析源文件…");
    parsed = await parseBook(meta, blob);
  }

  let outBlob: Blob;
  switch (targetKey) {
    case "txt": {
      if (meta.format === "pdf") {
        stage("正在提取 PDF 文本层…");
        outBlob = new Blob([await pdfToText(await blob.arrayBuffer())], { type: "text/plain;charset=utf-8" });
      } else {
        outBlob = new Blob([chaptersToText(parsed!.chapters)], { type: "text/plain;charset=utf-8" });
      }
      break;
    }
    case "html": {
      stage("正在组装 HTML 文档…");
      outBlob = new Blob([chaptersToHtmlDoc(parsed!.title, parsed!.author, parsed!.chapters)], { type: "text/html;charset=utf-8" });
      break;
    }
    case "md": {
      stage("正在转换为 Markdown…");
      const td = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
      const md = parsed!.chapters
        .map((c) => `${parsed!.chapters.length > 1 ? `## ${c.title}\n\n` : ""}${td.turndown(c.html)}`)
        .join("\n\n---\n\n");
      outBlob = new Blob([`# ${parsed!.title}\n\n> ${parsed!.author}\n\n${md}`], { type: "text/markdown;charset=utf-8" });
      break;
    }
    case "docx": {
      stage("正在生成 Word 文档…");
      outBlob = await chaptersToDocxBlob(parsed!.title, parsed!.author, parsed!.chapters);
      break;
    }
    case "pdf": {
      if (meta.format === "cbz") {
        stage("正在将图片合成 PDF 画册…");
        await parseBook(meta, blob); // 确保 zip 已缓存
        outBlob = await cbzToPdfBlob(meta.id);
      } else {
        stage("正在光栅化排版（中文 PDF）…");
        const html = parsed!.chapters
          .map((c) => `${parsed!.chapters.length > 1 ? `<h2>${c.title}</h2>` : ""}${c.html}`)
          .join("");
        outBlob = await htmlToPdfBlob(html, parsed!.title);
      }
      break;
    }
    case "epub2":
    case "epub3": {
      stage(`正在重排为 EPUB ${targetKey === "epub2" ? "2.0" : "3.0"} 包…`);
      outBlob = await buildEpub({
        title: parsed!.title,
        author: parsed!.author,
        chapters: parsed!.chapters.map((c) => ({ title: c.title, html: c.html })),
        version: targetKey === "epub2" ? 2 : 3,
        cover: parsed!.cover,
      });
      break;
    }
    case "png": {
      stage("正在光栅化 SVG…");
      outBlob = await svgToPngBlob(blob);
      break;
    }
    case "svg": {
      stage("正在封装为 SVG…");
      outBlob = await imageToSvgBlob(blob);
      break;
    }
    default:
      throw new Error(`未知转换目标：${targetKey}`);
  }

  return { blob: outBlob, filename: `${baseName}.${target.ext}`, format: target.label };
}
