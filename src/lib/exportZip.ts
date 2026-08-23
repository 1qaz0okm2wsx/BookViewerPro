import JSZip from "jszip";
import { saveAs } from "file-saver";
import type { Annotation, BookMeta, Bookmark, ExportedFile, ProgressState } from "../types";
import { FORMAT_LABEL } from "../types";

export interface ZipOptions {
  includeOriginal: boolean;
  includeNotesJson: boolean;
  includeNotesMd: boolean;
  includeNotesCsv: boolean;
  includeBookmarks: boolean;
  includeProgress: boolean;
  includeMeta: boolean;
  includeExports: boolean;
}

export const DEFAULT_ZIP_OPTIONS: ZipOptions = {
  includeOriginal: true,
  includeNotesJson: true,
  includeNotesMd: true,
  includeNotesCsv: false,
  includeBookmarks: true,
  includeProgress: true,
  includeMeta: true,
  includeExports: true,
};

const TYPE_LABEL: Record<Annotation["type"], string> = {
  highlight: "高亮", underline: "下划线", strike: "删除线", comment: "批注",
};

const fmtTime = (t: number) => new Date(t).toLocaleString("zh-CN", { hour12: false });

export function notesToMarkdown(meta: BookMeta, notes: Annotation[], bookmarks: Bookmark[]): string {
  const lines: string[] = [
    `# 《${meta.title}》读书笔记`,
    "",
    `> 作者：${meta.author} ｜ 格式：${FORMAT_LABEL[meta.format]} ｜ 导出时间：${fmtTime(Date.now())}`,
    `> 由 墨阁 BookViewer Pro 自动生成`,
    "",
  ];
  if (notes.length) {
    lines.push(`## 批注与高亮（${notes.length} 条）`, "");
    const byChapter = new Map<string, Annotation[]>();
    notes.forEach((n) => {
      const arr = byChapter.get(n.chapterTitle) ?? [];
      arr.push(n);
      byChapter.set(n.chapterTitle, arr);
    });
    byChapter.forEach((list, ch) => {
      lines.push(`### ${ch}`, "");
      list.forEach((n, i) => {
        lines.push(`${i + 1}. **[${TYPE_LABEL[n.type]}]** 「${n.text}」`);
        if (n.note) lines.push(`   - 批注：${n.note}`);
        lines.push(`   - ${fmtTime(n.createdAt)}`, "");
      });
    });
  } else {
    lines.push("_暂无批注记录。_", "");
  }
  if (bookmarks.length) {
    lines.push(`## 书签（${bookmarks.length} 枚）`, "");
    bookmarks.forEach((b, i) => {
      lines.push(`${i + 1}. 第 ${b.chapterIndex + 1} 章 · ${Math.round(b.percent * 100)}% 处${b.label ? ` —— 「${b.label}」` : ""}（${fmtTime(b.createdAt)}）`);
    });
    lines.push("");
  }
  return lines.join("\n");
}

export function notesToCsv(notes: Annotation[]): string {
  const esc = (s: string) => `"${(s ?? "").replace(/"/g, '""')}"`;
  const head = ["类型", "章节", "原文", "批注", "颜色", "起始偏移", "创建时间"];
  const rows = notes.map((n) =>
    [TYPE_LABEL[n.type], n.chapterTitle, n.text, n.note, n.color, String(n.start), fmtTime(n.createdAt)].map(esc).join(","),
  );
  return "\uFEFF" + [head.map(esc).join(","), ...rows].join("\r\n");
}

interface ExportZipParams {
  meta: BookMeta;
  blob: Blob | null;
  notes: Annotation[];
  bookmarks: Bookmark[];
  progress?: ProgressState;
  exports: ExportedFile[];
  options: ZipOptions;
}

export async function exportBookZip(p: ExportZipParams): Promise<string> {
  const zip = new JSZip();
  const safeTitle = (p.meta.title || "book").replace(/[\\/:*?"<>|]/g, "_").slice(0, 60);
  const root = zip.folder(safeTitle)!;

  if (p.options.includeOriginal && p.blob) {
    const book = root.folder("原书")!;
    const ext = p.meta.format === "image" ? "png" : p.meta.format;
    book.file(`${safeTitle}.${ext}`, p.blob);
  }

  const hasNotes = p.notes.length > 0;
  if (hasNotes && (p.options.includeNotesJson || p.options.includeNotesMd || p.options.includeNotesCsv)) {
    const notes = root.folder("笔记")!;
    if (p.options.includeNotesJson) {
      notes.file("annotations.json", JSON.stringify(p.notes, null, 2));
    }
    if (p.options.includeNotesMd) {
      notes.file("notes.md", notesToMarkdown(p.meta, p.notes, []));
    }
    if (p.options.includeNotesCsv) {
      notes.file("annotations.csv", notesToCsv(p.notes));
    }
  }

  if (p.options.includeBookmarks && p.bookmarks.length) {
    const marks = root.folder("书签")!;
    marks.file("bookmarks.json", JSON.stringify(p.bookmarks, null, 2));
    marks.file(
      "bookmarks.md",
      `# 书签列表\n\n` + p.bookmarks.map((b, i) =>
        `${i + 1}. 第 ${b.chapterIndex + 1} 章 · ${Math.round(b.percent * 100)}%${b.label ? ` —— 「${b.label}」` : ""}`).join("\n"),
    );
  }

  if (p.options.includeProgress && p.progress) {
    const dir = root.folder("阅读进度")!;
    dir.file("progress.json", JSON.stringify({
      bookId: p.meta.id,
      title: p.meta.title,
      chapterIndex: p.progress.chapterIndex,
      percent: p.progress.percent,
      page: p.progress.page ?? null,
      updatedAt: new Date(p.progress.updatedAt).toISOString(),
    }, null, 2));
  }

  if (p.options.includeMeta) {
    const dir = root.folder("元数据")!;
    dir.file("metadata.json", JSON.stringify({
      id: p.meta.id,
      title: p.meta.title,
      author: p.meta.author,
      format: p.meta.format,
      size: p.meta.size,
      addedAt: new Date(p.meta.addedAt).toISOString(),
      source: p.meta.source,
      exportedAt: new Date().toISOString(),
      tool: "墨阁 BookViewer Pro",
    }, null, 2));
    if (p.meta.cover && p.meta.cover.startsWith("data:")) {
      const m = /^data:image\/[a-zA-Z+]+;base64,(.+)$/.exec(p.meta.cover);
      if (m) dir.file("cover.jpg", m[1], { base64: true });
    }
  }

  if (p.options.includeExports && p.exports.length) {
    const dir = root.folder("转换文件")!;
    p.exports.forEach((f, i) => dir.file(`${String(i + 1).padStart(2, "0")}-${f.name}`, f.blob));
  }

  const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const zipName = `${safeTitle}_墨阁导出.zip`;
  saveAs(zipBlob, zipName);
  return zipName;
}
