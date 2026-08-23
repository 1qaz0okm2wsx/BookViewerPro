import JSZip from "jszip";
import DOMPurify from "dompurify";
import mammoth from "mammoth";
import { marked } from "marked";
import { uid } from "../types";
import type { BookFormat, BookMeta, ParsedBook, ParsedChapter } from "../types";

/* ================= 基础工具 ================= */

export function detectFormat(filename: string): BookFormat {
  const ext = (filename.toLowerCase().split(".").pop() ?? "").trim();
  const map: Record<string, BookFormat> = {
    epub: "epub", pdf: "pdf", docx: "docx", doc: "docx",
    html: "html", htm: "html", xhtml: "html",
    svg: "svg", txt: "txt", text: "txt", log: "txt",
    md: "md", markdown: "md",
    cbz: "cbz", zip: "cbz",
    mobi: "mobi", azw: "mobi", azw3: "mobi",
    fb2: "fb2",
    png: "image", jpg: "image", jpeg: "image", gif: "image",
    webp: "image", bmp: "image", avif: "image",
  };
  return map[ext] ?? "txt";
}

export function titleFromFile(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "未命名文档";
}

export function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("文件读取失败"));
    r.readAsDataURL(blob);
  });
}

export function readAsText(blob: Blob): Promise<string> {
  return blob.text();
}

export function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style").forEach((n) => n.remove());
  return (doc.body.textContent ?? "").replace(/\u00a0/g, " ");
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type Resolver = (src: string) => Promise<string | null>;
const noResolver: Resolver = async () => null;

/** DOMPurify 清洗 + 图片转 dataURL + 去除脚本样式 */
async function sanitizeAndInline(html: string, resolveSrc: Resolver): Promise<string> {
  const clean = DOMPurify.sanitize(html, { ADD_ATTR: ["target"] });
  const doc = new DOMParser().parseFromString(`<div id="bv-r">${clean}</div>`, "text/html");
  const root = doc.getElementById("bv-r");
  if (!root) return "";
  const imgs = Array.from(root.querySelectorAll("img"));
  for (const img of imgs) {
    const src = img.getAttribute("src") || "";
    if (!src || src.startsWith("data:") || src.startsWith("blob:")) continue;
    const url = await resolveSrc(src);
    if (url) img.setAttribute("src", url);
    else img.remove();
  }
  root.querySelectorAll("script,style,link,iframe").forEach((n) => n.remove());
  return root.innerHTML;
}

/** 按 H1/H2 将一段 HTML 拆分为章节 */
function splitHtmlByHeadings(html: string, fallbackTitle: string): ParsedChapter[] {
  const doc = new DOMParser().parseFromString(`<div id="bv-root">${html}</div>`, "text/html");
  const root = doc.getElementById("bv-root");
  if (!root) return [];
  const groups: Array<{ title: string; nodes: Node[] }> = [];
  let cur: { title: string; nodes: Node[] } | null = null;
  Array.from(root.childNodes).forEach((n) => {
    const el = n as HTMLElement;
    const isHead = el.nodeType === 1 && (el.tagName === "H1" || el.tagName === "H2");
    if (isHead) {
      cur = { title: (el.textContent || "").trim().slice(0, 60) || `第 ${groups.length + 1} 部分`, nodes: [] };
      groups.push(cur);
    } else {
      if (!cur) {
        cur = { title: fallbackTitle, nodes: [] };
        groups.push(cur);
      }
      cur.nodes.push(n);
    }
  });
  const chapters: ParsedChapter[] = [];
  for (const g of groups) {
    const holder = document.createElement("div");
    g.nodes.forEach((n) => holder.appendChild(n.cloneNode(true)));
    const inner = holder.innerHTML.trim();
    const hasText = (holder.textContent ?? "").trim().length > 0;
    const hasImg = Boolean(holder.querySelector("img"));
    if (inner && (hasText || hasImg)) {
      chapters.push({ id: `ch-${chapters.length}-${uid().slice(0, 6)}`, title: g.title, html: inner });
    }
  }
  if (!chapters.length) {
    chapters.push({ id: "ch-0", title: fallbackTitle, html: `<p>${escapeHtml((root.textContent ?? "").trim().slice(0, 2000) || "（空文档）")}</p>` });
  }
  return chapters;
}

/** 纯文本按「第X章/节/回」拆章，超长无标题则按段切块 */
function chunkPlainText(text: string, fallbackTitle: string): ParsedChapter[] {
  const clean = text.replace(/\ufeff/g, "");
  const lines = clean.split(/\r?\n/);
  const headRe = /^\s*(第\s*[0-9〇一二三四五六七八九十百千两]+\s*[章节回卷篇部集讲]|Chapter\s+\d+|CHAPTER\s+\d+|PART\s+\d+)/i;
  const sections: Array<{ title: string; lines: string[] }> = [];
  let cur: { title: string; lines: string[] } | null = null;
  for (const line of lines) {
    if (headRe.test(line)) {
      cur = { title: line.trim().slice(0, 60), lines: [] };
      sections.push(cur);
    } else {
      if (!cur) {
        cur = { title: fallbackTitle, lines: [] };
        sections.push(cur);
      }
      cur.lines.push(line);
    }
  }
  let chapters = sections
    .filter((s) => s.lines.join("").trim().length > 0)
    .map((s, i) => ({
      id: `ch-${i}`,
      title: s.title,
      html: s.lines
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => `<p>${escapeHtml(l)}</p>`)
        .join("\n"),
    }));
  if (chapters.length <= 1 && clean.length > 12000) {
    const paras = clean.split(/\n{2,}|\n/).map((p) => p.trim()).filter(Boolean);
    chapters = [];
    for (let i = 0; i < paras.length; i += 160) {
      chapters.push({
        id: `ch-${chapters.length}`,
        title: `第 ${chapters.length + 1} 部分`,
        html: paras.slice(i, i + 160).map((p) => `<p>${escapeHtml(p)}</p>`).join("\n"),
      });
    }
  }
  if (!chapters.length) {
    chapters = [{ id: "ch-0", title: fallbackTitle, html: `<p>${escapeHtml(clean.trim() || "（空文档）")}</p>` }];
  }
  return chapters;
}

function wordCountOf(chapters: ParsedChapter[]): number {
  return chapters.reduce((sum, c) => sum + stripHtml(c.html).replace(/\s/g, "").length, 0);
}

/* ================= EPUB ================= */

async function parseEpub(meta: BookMeta, blob: Blob, fallbackTitle: string): Promise<ParsedBook> {
  const z = await JSZip.loadAsync(await blob.arrayBuffer());
  let opfPath = "";
  const container = z.file("META-INF/container.xml");
  if (container) {
    const xml = await container.async("text");
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    opfPath = doc.getElementsByTagName("rootfile")[0]?.getAttribute("full-path") ?? "";
  }
  if (!opfPath) {
    for (const p of Object.keys(z.files)) {
      if (/\.opf$/i.test(p) && !/\/\./.test(p)) { opfPath = p; break; }
    }
  }
  if (!opfPath) throw new Error("EPUB 包中未找到 OPF 描述文件");
  const opfEntry = z.file(opfPath);
  if (!opfEntry) throw new Error(`OPF 文件缺失：${opfPath}`);
  const opf = new DOMParser().parseFromString(await opfEntry.async("text"), "application/xml");
  const base = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
  const resolve = (href: string): string => {
    const h = href.split("#")[0].split("?")[0];
    if (!h) return "";
    try {
      return decodeURIComponent(new URL(h, `https://bv.local/${base}`).pathname.slice(1));
    } catch {
      return base + h;
    }
  };

  const dcText = (tag: string): string => {
    const el =
      opf.getElementsByTagNameNS("http://purl.org/dc/elements/1.1/", tag)[0] ??
      opf.getElementsByTagName(`dc:${tag}`)[0];
    return el?.textContent?.trim() ?? "";
  };
  const title = dcText("title") || dcText("source") || fallbackTitle;
  const author = dcText("creator") || "佚名";

  const items = new Map<string, { href: string; media: string; props: string }>();
  Array.from(opf.getElementsByTagName("item")).forEach((it) => {
    const id = it.getAttribute("id") ?? "";
    const href = it.getAttribute("href") ?? "";
    if (id && href) {
      items.set(id, {
        href,
        media: it.getAttribute("media-type") ?? "",
        props: it.getAttribute("properties") ?? "",
      });
    }
  });

  // 封面
  let cover: string | undefined;
  try {
    let coverHref = "";
    Array.from(items.values()).forEach((it) => {
      if (!coverHref && it.media.startsWith("image/") && (it.props.includes("cover-image") || /(^|\/)cover\./i.test(it.href))) {
        coverHref = it.href;
      }
    });
    if (!coverHref) {
      const metaCover = opf.querySelector('meta[name="cover"]')?.getAttribute("content") ?? "";
      if (metaCover && items.has(metaCover)) coverHref = items.get(metaCover)!.href;
    }
    if (coverHref) {
      const entry = z.file(resolve(coverHref));
      if (entry) cover = await readAsDataUrl(await entry.async("blob"));
    }
  } catch { /* 封面失败不影响正文 */ }

  const spineIds: string[] = [];
  Array.from(opf.getElementsByTagName("itemref")).forEach((r) => {
    const idref = r.getAttribute("idref");
    if (idref) spineIds.push(idref);
  });
  const ordered = spineIds.filter((id) => items.has(id)).map((id) => items.get(id)!);
  if (!ordered.length) {
    Array.from(items.values()).forEach((it) => {
      if (it.media.includes("xhtml") || it.media.includes("html")) ordered.push(it);
    });
  }
  if (!ordered.length) throw new Error("EPUB 中没有可阅读的文档");

  const resolver: Resolver = async (src) => {
    try {
      const entry = z.file(src);
      return entry ? await readAsDataUrl(await entry.async("blob")) : null;
    } catch {
      return null;
    }
  };

  const chapters: ParsedChapter[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const it = ordered[i];
    const path = resolve(it.href);
    const entry = z.file(path);
    if (!entry) continue;
    const raw = await entry.async("text");
    const docDir = path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
    const docResolver: Resolver = async (src) => resolver(docDir ? resolve(docDir + src) : src) ?? resolver(src);
    const doc = new DOMParser().parseFromString(raw, "text/html");
    const body = doc.body;
    if (!body) continue;
    const inner = await sanitizeAndInline(body.innerHTML, docResolver);
    if (!stripHtml(inner).trim() && !/<img/i.test(inner)) continue;
    const parts = splitHtmlByHeadings(inner, title);
    if (ordered.length === 1) {
      chapters.push(...parts);
    } else {
      chapters.push({
        id: `ch-${i}-${uid().slice(0, 6)}`,
        title: parts.length === 1 ? parts[0].title : `第 ${chapters.length + 1} 节`,
        html: parts.map((p) => (parts.length > 1 ? `<h2>${escapeHtml(p.title)}</h2>` : "") + p.html).join("\n"),
      });
    }
  }
  if (!chapters.length) throw new Error("EPUB 正文为空");

  const metaExtra: Record<string, string> = {};
  const lang = dcText("language");
  const date = dcText("date");
  const publisher = dcText("publisher");
  if (lang) metaExtra["语言"] = lang;
  if (date) metaExtra["日期"] = date;
  if (publisher) metaExtra["出版"] = publisher;

  return {
    kind: "chapters", format: "epub", title, author, chapters,
    imageCount: 0, cover, wordCount: wordCountOf(chapters), metaExtra,
  };
}

/* ================= CBZ ================= */

const cbzZips = new Map<string, JSZip>();
const cbzLists = new Map<string, string[]>();

function isImageEntry(name: string): boolean {
  if (name.startsWith("__MACOSX")) return false;
  if (/\/\./.test(name) || name.startsWith(".")) return false;
  return /\.(jpe?g|png|gif|webp|bmp|avif)$/i.test(name);
}

async function parseCbz(buf: ArrayBuffer, bookId: string): Promise<number> {
  const z = await JSZip.loadAsync(buf);
  const names = Object.keys(z.files)
    .filter((n) => !z.files[n].dir && isImageEntry(n))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  if (!names.length) throw new Error("CBZ 压缩包中没有找到图片");
  cbzZips.set(bookId, z);
  cbzLists.set(bookId, names);
  return names.length;
}

export function getCbzImageList(bookId: string): string[] {
  return cbzLists.get(bookId) ?? [];
}

export async function getCbzImage(bookId: string, index: number): Promise<string> {
  const z = cbzZips.get(bookId);
  const names = cbzLists.get(bookId);
  if (!z || !names || !names[index]) throw new Error("漫画图片不可用，请重新打开本书");
  const blob = await z.file(names[index])!.async("blob");
  return readAsDataUrl(blob);
}

/* ================= MOBI / AZW ================= */

function palmdocDecompress(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < data.length) {
    const c = data[i++];
    if (c === 0) {
      out.push(c);
    } else if (c <= 8) {
      for (let n = 0; n < c && i < data.length; n++) out.push(data[i++]);
    } else if (c <= 0x7f) {
      out.push(c);
    } else if (c <= 0xbf) {
      if (i >= data.length) break;
      const next = data[i++];
      const dist = (((c << 8) | next) >> 3) & 0x7ff;
      const len = (next & 7) + 3;
      for (let n = 0; n < len; n++) out.push(out[out.length - dist] ?? 0);
    } else {
      out.push(32, c ^ 0x80);
    }
  }
  return new Uint8Array(out);
}

async function parseMobi(buf: ArrayBuffer, fallbackTitle: string): Promise<{ title: string; author: string; html: string }> {
  if (buf.byteLength < 78 + 8) throw new Error("文件过小，不是有效的 MOBI 文件");
  const dv = new DataView(buf);
  const numRecords = dv.getUint16(76);
  if (numRecords < 2) throw new Error("MOBI 文件记录数异常");
  const recOffset = (i: number) => dv.getUint32(78 + i * 8);
  const rec0 = recOffset(0);
  const compression = dv.getUint16(rec0);
  const textRecordCount = dv.getUint16(rec0 + 8);
  const encryption = dv.getUint16(rec0 + 14);
  if (encryption !== 0) throw new Error("该 MOBI 文件已加密（DRM），无法解析");
  if (compression !== 1 && compression !== 2) throw new Error(`不支持的压缩方式（code=${compression}）`);

  let title = fallbackTitle;
  let encoding = 65001;
  const magic = String.fromCharCode(
    dv.getUint8(rec0 + 16), dv.getUint8(rec0 + 17), dv.getUint8(rec0 + 18), dv.getUint8(rec0 + 19),
  );
  if (magic === "MOBI") {
    encoding = dv.getUint32(rec0 + 28) || 65001;
    try {
      const nameOffset = dv.getUint32(rec0 + 84);
      const nameLength = dv.getUint32(rec0 + 88);
      if (nameLength > 0 && nameLength < 512 && rec0 + nameOffset + nameLength <= buf.byteLength) {
        const bytes = new Uint8Array(buf, rec0 + nameOffset, nameLength);
        const dec = encoding === 65001 ? new TextDecoder("utf-8") : new TextDecoder("windows-1252");
        const t = dec.decode(bytes).trim();
        if (t) title = t;
      }
    } catch { /* 保持默认标题 */ }
  }

  const decoder = encoding === 65001 ? new TextDecoder("utf-8") : new TextDecoder("windows-1252");
  const parts: string[] = [];
  const count = Math.min(textRecordCount || numRecords - 1, numRecords - 1);
  for (let i = 1; i <= count; i++) {
    const start = recOffset(i);
    const len = Math.min(recOffset(i + 1) - start, 4096);
    if (len <= 0) continue;
    let bytes: Uint8Array = new Uint8Array(buf, start, len);
    if (compression === 2) bytes = palmdocDecompress(bytes);
    parts.push(decoder.decode(bytes, { stream: true }));
  }
  const html = parts.join("");
  if (!/<[a-z]/i.test(html)) throw new Error("无法识别该 MOBI 文件的文本编码");
  return { title, author: "—", html };
}

/* ================= FB2 ================= */

function fb2Inline(html: string): string {
  return html
    .replace(/<emphasis>([\s\S]*?)<\/emphasis>/g, "<em>$1</em>")
    .replace(/<strong>([\s\S]*?)<\/strong>/g, "<strong>$1</strong>")
    .replace(/<strikethrough>([\s\S]*?)<\/strikethrough>/g, "<s>$1</s>")
    .replace(/<sub>([\s\S]*?)<\/sub>/g, "<sub>$1</sub>")
    .replace(/<sup>([\s\S]*?)<\/sup>/g, "<sup>$1</sup>")
    .replace(/<code>([\s\S]*?)<\/code>/g, "<code>$1</code>")
    .replace(/<(?!\/?(em|strong|s|sub|sup|code|br)\b)[a-zA-Z][^>]*>/g, "");
}

function fb2SectionToHtml(section: Element): string {
  const out: string[] = [];
  Array.from(section.children).forEach((el) => {
    switch (el.tagName) {
      case "title":
        out.push(`<h2>${fb2Inline(el.innerHTML)}</h2>`);
        break;
      case "subtitle":
        out.push(`<h3>${fb2Inline(el.innerHTML)}</h3>`);
        break;
      case "p":
        out.push(`<p>${fb2Inline(el.innerHTML)}</p>`);
        break;
      case "epigraph":
      case "cite":
        out.push(`<blockquote>${Array.from(el.getElementsByTagName("p")).map((p) => `<p>${fb2Inline(p.innerHTML)}</p>`).join("")}</blockquote>`);
        break;
      case "poem":
        out.push(`<p>${Array.from(el.getElementsByTagName("p")).map((p) => fb2Inline(p.innerHTML)).join("<br/>")}</p>`);
        break;
      case "empty-line":
        out.push("<p>&#160;</p>");
        break;
      case "section":
        out.push(fb2SectionToHtml(el));
        break;
      default:
        break;
    }
  });
  return out.join("\n");
}

function parseFb2Text(text: string, fallbackTitle: string): { title: string; author: string; chapters: ParsedChapter[] } {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("FB2 XML 解析失败，文件可能已损坏");
  const title = doc.getElementsByTagName("book-title")[0]?.textContent?.trim() || fallbackTitle;
  const authorEl = doc.getElementsByTagName("author")[0];
  let author = "佚名";
  if (authorEl) {
    const name = [
      authorEl.getElementsByTagName("first-name")[0]?.textContent?.trim(),
      authorEl.getElementsByTagName("last-name")[0]?.textContent?.trim(),
    ].filter(Boolean).join(" ");
    if (name) author = name;
  }
  const sections = Array.from(doc.getElementsByTagName("section"));
  let chapters: ParsedChapter[];
  if (sections.length) {
    chapters = sections
      .map((s, i) => ({
        id: `ch-${i}`,
        title: (s.getElementsByTagName("title")[0]?.textContent?.trim() || `第 ${i + 1} 节`).slice(0, 60),
        html: fb2SectionToHtml(s),
      }))
      .filter((c) => stripHtml(c.html).trim().length > 0);
  } else {
    const body = doc.getElementsByTagName("body")[0];
    chapters = body ? splitHtmlByHeadings(fb2SectionToHtml(body), title) : [];
  }
  if (!chapters.length) chapters = [{ id: "ch-0", title, html: "<p>（空文档）</p>" }];
  return { title, author, chapters };
}

/* ================= 主入口 ================= */

const parsedCache = new Map<string, ParsedBook>();

export async function parseBook(meta: BookMeta, blob: Blob): Promise<ParsedBook> {
  const cached = parsedCache.get(meta.id);
  if (cached) return cached;
  const fallbackTitle = meta.title || "未命名文档";
  let result: ParsedBook;

  switch (meta.format) {
    case "epub": {
      result = await parseEpub(meta, blob, fallbackTitle);
      break;
    }
    case "docx": {
      const res = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() });
      const html = await sanitizeAndInline(res.value, noResolver);
      const chapters = splitHtmlByHeadings(html, fallbackTitle);
      result = { kind: "chapters", format: "docx", title: fallbackTitle, author: "—", chapters, imageCount: 0, wordCount: wordCountOf(chapters) };
      break;
    }
    case "txt": {
      const text = await readAsText(blob);
      const chapters = chunkPlainText(text, fallbackTitle);
      result = { kind: "chapters", format: "txt", title: fallbackTitle, author: "—", chapters, imageCount: 0, wordCount: wordCountOf(chapters) };
      break;
    }
    case "md": {
      const text = await readAsText(blob);
      const html = await sanitizeAndInline(String(await marked.parse(text, { breaks: true })), noResolver);
      const chapters = splitHtmlByHeadings(html, fallbackTitle);
      result = { kind: "chapters", format: "md", title: fallbackTitle, author: "—", chapters, imageCount: 0, wordCount: wordCountOf(chapters) };
      break;
    }
    case "html": {
      const text = await readAsText(blob);
      const doc = new DOMParser().parseFromString(text, "text/html");
      const inner = await sanitizeAndInline(doc.body.innerHTML, noResolver);
      const chapters = splitHtmlByHeadings(inner, doc.title || fallbackTitle);
      result = {
        kind: "chapters", format: "html", title: doc.title || fallbackTitle, author: "—",
        chapters, imageCount: 0, wordCount: wordCountOf(chapters),
      };
      break;
    }
    case "fb2": {
      const text = await readAsText(blob);
      const r = parseFb2Text(text, fallbackTitle);
      result = { kind: "chapters", format: "fb2", title: r.title, author: r.author, chapters: r.chapters, imageCount: 0, wordCount: wordCountOf(r.chapters) };
      break;
    }
    case "mobi": {
      const r = await parseMobi(await blob.arrayBuffer(), fallbackTitle);
      const html = await sanitizeAndInline(r.html, noResolver);
      const chapters = splitHtmlByHeadings(html, r.title);
      result = { kind: "chapters", format: "mobi", title: r.title, author: r.author, chapters, imageCount: 0, wordCount: wordCountOf(chapters) };
      break;
    }
    case "pdf": {
      result = { kind: "pdf", format: "pdf", title: fallbackTitle, author: "—", chapters: [], pdfData: await blob.arrayBuffer(), imageCount: 0, wordCount: 0 };
      break;
    }
    case "cbz": {
      const count = await parseCbz(await blob.arrayBuffer(), meta.id);
      result = { kind: "image", format: "cbz", title: fallbackTitle, author: "—", chapters: [], imageCount: count, wordCount: 0, metaExtra: { "页数": String(count) } };
      break;
    }
    case "svg":
    case "image": {
      result = { kind: "image", format: meta.format, title: fallbackTitle, author: "—", chapters: [], imageCount: 1, imageDataUrl: await readAsDataUrl(blob), wordCount: 0 };
      break;
    }
    default:
      throw new Error("暂不支持阅读该格式");
  }

  parsedCache.set(meta.id, result);
  return result;
}
