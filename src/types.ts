export type BookFormat =
  | "epub" | "pdf" | "docx" | "html" | "svg" | "txt"
  | "md" | "cbz" | "mobi" | "fb2" | "image";

export type View = "shelf" | "reader" | "convert" | "edit" | "notes" | "stats" | "ocr" | "export";

export interface BookMeta {
  id: string;
  title: string;
  author: string;
  format: BookFormat;
  size: number;
  addedAt: number;
  cover?: string;
  source: "user" | "sample";
  tags?: string[];
  rating?: number;   // 0-5
  review?: string;
}

export type NoteType = "highlight" | "underline" | "strike" | "comment";

export interface Annotation {
  id: string;
  bookId: string;
  chapterId: string;
  chapterTitle: string;
  type: NoteType;
  color: string;
  text: string;
  note: string;
  start: number;
  end: number;
  createdAt: number;
  updatedAt: number;
}

export interface Bookmark {
  id: string;
  bookId: string;
  chapterIndex: number;
  percent: number;
  page?: number;
  label: string;
  createdAt: number;
}

export interface ProgressState {
  chapterIndex: number;
  percent: number;
  page?: number;
  updatedAt: number;
}

export interface ParsedChapter {
  id: string;
  title: string;
  html: string;
}

export type ParsedKind = "chapters" | "pdf" | "image";

export interface ParsedBook {
  kind: ParsedKind;
  format: BookFormat;
  title: string;
  author: string;
  chapters: ParsedChapter[];
  pdfData?: ArrayBuffer;
  imageCount: number;
  imageDataUrl?: string;
  cover?: string;
  wordCount: number;
  metaExtra?: Record<string, string>;
}

export interface ExportedFile {
  id: string;
  name: string;
  size: number;
  format: string;
  bookId?: string;
  bookTitle?: string;
  blob: Blob;
  createdAt: number;
}

export interface Toast {
  id: string;
  kind: "success" | "error" | "info";
  text: string;
}

export interface PendingJump {
  bookId: string;
  annotationId?: string;
  chapterId?: string;
  chapterIndex?: number;
  percent?: number;
  page?: number;
}

/* ---------- 阅读统计 ---------- */
export interface DayStat {
  seconds: number;
  pages: number;
}
/** key: YYYY-MM-DD */
export type StatsMap = Record<string, DayStat>;

/* ---------- 快捷键 ---------- */
export type ShortcutAction =
  | "prev" | "next" | "zoomIn" | "zoomOut"
  | "bookmark" | "highlight" | "search" | "autoscroll";

export const SHORTCUT_LABEL: Record<ShortcutAction, string> = {
  prev: "上一页 / 章",
  next: "下一页 / 章",
  zoomIn: "放大版面",
  zoomOut: "缩小版面",
  bookmark: "添加书签",
  highlight: "高亮选中文字",
  search: "打开全文搜索",
  autoscroll: "自动滚动开关",
};

export const DEFAULT_KEYS: Record<ShortcutAction, string> = {
  prev: "arrowleft",
  next: "arrowright",
  zoomIn: "+",
  zoomOut: "-",
  bookmark: "b",
  highlight: "h",
  search: "f",
  autoscroll: "s",
};

export function normKey(e: KeyboardEvent): string {
  if (e.key === " ") return "space";
  if (e.key.length === 1) return e.key.toLowerCase();
  return e.key.toLowerCase();
}

/* ---------- OCR ---------- */
export interface OcrWord {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OcrPageResult {
  page: number;
  width: number;
  height: number;
  text: string;
  words: OcrWord[];
}

/** key: 页码字符串 */
export type OcrBookMap = Record<string, OcrPageResult>;

/* ---------- 展示辅助 ---------- */

export const FORMAT_LABEL: Record<BookFormat, string> = {
  epub: "EPUB", pdf: "PDF", docx: "DOCX", html: "HTML", svg: "SVG",
  txt: "TXT", md: "Markdown", cbz: "CBZ", mobi: "MOBI", fb2: "FB2", image: "图片",
};

export const FORMAT_COLOR: Record<BookFormat, string> = {
  epub: "#3f6b52", pdf: "#b3402a", docx: "#2f5d8a", html: "#c07a26",
  svg: "#8a5aa8", txt: "#6b7280", md: "#4a7a9b", cbz: "#a8663a",
  mobi: "#7a6a3a", fb2: "#5a7d4a", image: "#9a5a6a",
};

/** 支持导入的扩展名白名单（文件夹扫描用） */
export const IMPORT_EXTS = [
  "epub", "pdf", "docx", "doc", "html", "htm", "xhtml", "svg", "txt", "text",
  "md", "markdown", "cbz", "zip", "mobi", "azw", "azw3", "fb2",
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "avif",
];

export function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function fmtDuration(totalSeconds: number): string {
  const s = Math.floor(totalSeconds);
  if (s < 60) return `${s} 秒`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} 分${s % 60 ? ` ${s % 60} 秒` : ""}`;
  const h = Math.floor(m / 60);
  return `${h} 小时 ${m % 60 ? `${m % 60} 分` : ""}`.trim();
}

export function todayKey(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
