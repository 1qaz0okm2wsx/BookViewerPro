export type BookFormat =
  | "epub" | "pdf" | "docx" | "html" | "svg" | "txt"
  | "md" | "cbz" | "mobi" | "fb2" | "image";

export type View = "shelf" | "reader" | "convert" | "edit" | "notes" | "export";

export interface BookMeta {
  id: string;
  title: string;
  author: string;
  format: BookFormat;
  size: number;
  addedAt: number;
  cover?: string;
  source: "user" | "sample";
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

export const FORMAT_LABEL: Record<BookFormat, string> = {
  epub: "EPUB", pdf: "PDF", docx: "DOCX", html: "HTML", svg: "SVG",
  txt: "TXT", md: "Markdown", cbz: "CBZ", mobi: "MOBI", fb2: "FB2", image: "图片",
};

export const FORMAT_COLOR: Record<BookFormat, string> = {
  epub: "#3f6b52", pdf: "#b3402a", docx: "#2f5d8a", html: "#c07a26",
  svg: "#8a5aa8", txt: "#6b7280", md: "#4a7a9b", cbz: "#a8663a",
  mobi: "#7a6a3a", fb2: "#5a7d4a", image: "#9a5a6a",
};

export function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
