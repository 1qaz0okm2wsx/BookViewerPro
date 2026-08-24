import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { set } from "idb-keyval";
import { KEYS, fileKey, loadJSON, saveJSON, del } from "./lib/idb";
import { buildSamples } from "./lib/samples";
import { detectFormat, parseBook, titleFromFile } from "./lib/parse";
import { makeCover } from "./lib/cover";
import {
  uid, FORMAT_LABEL, DEFAULT_KEYS, todayKey,
} from "./types";
import type {
  Annotation, BookMeta, Bookmark, ExportedFile, OcrBookMap, PendingJump,
  ProgressState, ShortcutAction, StatsMap, Toast, View,
} from "./types";

const LS_KEYS = "bv.keys";

interface AppContextValue {
  ready: boolean;
  books: BookMeta[];
  annotations: Annotation[];
  bookmarks: Bookmark[];
  progress: Record<string, ProgressState>;
  exports: ExportedFile[];
  toasts: Toast[];
  stats: StatsMap;
  keybindings: Record<ShortcutAction, string>;
  view: View;
  setView: (v: View) => void;
  activeBookId: string | null;
  openBook: (id: string) => void;
  closeReader: () => void;
  addFiles: (files: FileList | File[]) => Promise<void>;
  importBatch: (files: FileList | File[], onProgress?: (done: number, total: number, name: string) => void) => Promise<number>;
  removeBook: (id: string) => void;
  updateBookMeta: (id: string, patch: Partial<BookMeta>) => void;
  getBlob: (id: string) => Promise<Blob | undefined>;
  addAnnotation: (a: Omit<Annotation, "id" | "createdAt" | "updatedAt">) => Annotation;
  updateAnnotation: (id: string, patch: Partial<Annotation>) => void;
  removeAnnotation: (id: string) => void;
  addBookmark: (b: Omit<Bookmark, "id" | "createdAt">) => void;
  removeBookmark: (id: string) => void;
  setProgress: (bookId: string, p: Omit<ProgressState, "updatedAt">) => void;
  addExport: (e: Omit<ExportedFile, "id" | "createdAt">) => void;
  removeExport: (id: string) => void;
  addReadingTick: (seconds: number, pages: number) => void;
  clearStats: () => void;
  setKeybinding: (action: ShortcutAction, key: string) => void;
  resetKeybindings: () => void;
  getOcr: (bookId: string) => Promise<OcrBookMap>;
  toast: (text: string, kind?: Toast["kind"]) => void;
  dismissToast: (id: string) => void;
  pendingJump: PendingJump | null;
  setPendingJump: (j: PendingJump | null) => void;
  exportPickId: string | null;
  setExportPickId: (id: string | null) => void;
}

const Ctx = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp 必须在 Provider 内使用");
  return v;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [books, setBooks] = useState<BookMeta[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [progress, setProgressMap] = useState<Record<string, ProgressState>>({});
  const [exports, setExports] = useState<ExportedFile[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [stats, setStats] = useState<StatsMap>({});
  const [view, setView] = useState<View>("shelf");
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [pendingJump, setPendingJump] = useState<PendingJump | null>(null);
  const [exportPickId, setExportPickId] = useState<string | null>(null);
  const [keybindings, setKeybindings] = useState<Record<ShortcutAction, string>>(() => {
    try {
      const raw = localStorage.getItem(LS_KEYS);
      if (raw) return { ...DEFAULT_KEYS, ...(JSON.parse(raw) as Partial<Record<ShortcutAction, string>>) };
    } catch { /* ignore */ }
    return DEFAULT_KEYS;
  });
  const timers = useRef<number[]>([]);

  /* ---------- 初始化 ---------- */
  useEffect(() => {
    (async () => {
      let list = await loadJSON<BookMeta[]>(KEYS.books, []);
      if (!list.length) {
        const seeded = await loadJSON<boolean>(KEYS.seeded, false);
        if (!seeded) {
          try {
            const samples = await buildSamples();
            for (const s of samples) await set(fileKey(s.meta.id), s.blob);
            list = samples.map((s) => s.meta);
            await saveJSON(KEYS.seeded, true);
          } catch (e) {
            console.warn("示例书库构建失败", e);
          }
        }
      }
      setBooks(list);
      setAnnotations(await loadJSON<Annotation[]>(KEYS.notes, []));
      setBookmarks(await loadJSON<Bookmark[]>(KEYS.marks, []));
      setProgressMap(await loadJSON<Record<string, ProgressState>>(KEYS.progress, {}));
      setStats(await loadJSON<StatsMap>(KEYS.stats, {}));
      setReady(true);
    })();
    return () => {
      timers.current.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  /* ---------- 持久化 ---------- */
  useEffect(() => { if (ready) saveJSON(KEYS.books, books); }, [books, ready]);
  useEffect(() => { if (ready) saveJSON(KEYS.notes, annotations); }, [annotations, ready]);
  useEffect(() => { if (ready) saveJSON(KEYS.marks, bookmarks); }, [bookmarks, ready]);
  useEffect(() => { if (ready) saveJSON(KEYS.progress, progress); }, [progress, ready]);
  useEffect(() => { if (ready) saveJSON(KEYS.stats, stats); }, [stats, ready]);

  /* ---------- toast ---------- */
  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);
  const toast = useCallback((text: string, kind: Toast["kind"] = "success") => {
    const id = uid();
    setToasts((prev) => [...prev.slice(-3), { id, text, kind }]);
    timers.current.push(window.setTimeout(() => dismissToast(id), 3400));
  }, [dismissToast]);

  /* ---------- 书库 ---------- */
  const buildMetaForFile = useCallback(async (file: File): Promise<{ meta: BookMeta; file: File }> => {
    let format = detectFormat(file.name);
    if (/\.zip$/i.test(file.name)) {
      try {
        const z = await JSZip.loadAsync(file);
        format = z.file("mimetype") ? "epub" : "cbz";
      } catch {
        format = "cbz";
      }
    }
    const id = uid();
    const title = titleFromFile(file.name);
    const cover = await makeCover(title.slice(0, 12), "—", FORMAT_LABEL[format]).catch(() => undefined);
    const meta: BookMeta = {
      id, title, author: "—", format, size: file.size,
      addedAt: Date.now(), cover, source: "user", tags: [],
    };
    return { meta, file };
  }, []);

  /** 对可解析格式提取真实元数据（书名/作者/封面） */
  const enrichMeta = useCallback(async (meta: BookMeta, blob: Blob): Promise<BookMeta> => {
    if (!["epub", "fb2", "md", "txt", "html", "mobi", "docx"].includes(meta.format)) return meta;
    try {
      const parsed = await parseBook(meta, blob);
      return {
        ...meta,
        title: parsed.title || meta.title,
        author: parsed.author && parsed.author !== "—" ? parsed.author : meta.author,
        cover: parsed.cover ?? meta.cover,
      };
    } catch {
      return meta;
    }
  }, []);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    const added: BookMeta[] = [];
    for (const file of list) {
      const { meta, file: f } = await buildMetaForFile(file);
      try {
        await set(fileKey(meta.id), f);
        added.push(await enrichMeta(meta, f));
      } catch {
        toast(`《${meta.title}》写入本地存储失败`, "error");
      }
    }
    if (added.length) {
      setBooks((prev) => [...added, ...prev]);
      toast(`已加入书架：${added.slice(0, 3).map((b) => `《${b.title}》`).join("、")}${added.length > 3 ? ` 等 ${added.length} 本` : ""}`);
    }
  }, [buildMetaForFile, enrichMeta, toast]);

  /** 文件夹批量扫描导入：过滤支持格式 → 逐个写入 → 提取元数据，带进度回调 */
  const importBatch = useCallback(async (
    files: FileList | File[],
    onProgress?: (done: number, total: number, name: string) => void,
  ): Promise<number> => {
    const exts = ["epub", "pdf", "docx", "doc", "html", "htm", "xhtml", "svg", "txt", "text", "md", "markdown", "cbz", "zip", "mobi", "azw", "azw3", "fb2", "png", "jpg", "jpeg", "gif", "webp", "bmp", "avif"];
    const list = Array.from(files).filter((f) => {
      const ext = (f.name.toLowerCase().split(".").pop() ?? "").trim();
      return exts.includes(ext) && f.size > 0;
    });
    let done = 0;
    for (const file of list) {
      onProgress?.(done, list.length, file.name);
      const { meta, file: f } = await buildMetaForFile(file);
      try {
        await set(fileKey(meta.id), f);
        const enriched = await enrichMeta(meta, f);
        setBooks((prev) => [enriched, ...prev]);
      } catch {
        console.warn("导入失败：", file.name);
      }
      done++;
      onProgress?.(done, list.length, file.name);
    }
    if (list.length) toast(`扫描完成：成功导入 ${done} 本`);
    return done;
  }, [buildMetaForFile, enrichMeta, toast]);

  const removeBook = useCallback(async (id: string) => {
    const book = books.find((b) => b.id === id);
    await del(fileKey(id));
    await del(`bv:ocr:${id}`);
    setBooks((prev) => prev.filter((b) => b.id !== id));
    setAnnotations((prev) => prev.filter((n) => n.bookId !== id));
    setBookmarks((prev) => prev.filter((n) => n.bookId !== id));
    setProgressMap((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (activeBookId === id) setActiveBookId(null);
    toast(book ? `已移除《${book.title}》及其笔记与 OCR 缓存` : "已移除", "info");
  }, [books, activeBookId, toast]);

  const updateBookMeta = useCallback((id: string, patch: Partial<BookMeta>) => {
    setBooks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }, []);

  const getBlob = useCallback((id: string) => loadJSON<Blob | undefined>(fileKey(id), undefined), []);

  /* ---------- 笔记 / 书签 / 进度 ---------- */
  const addAnnotation = useCallback((a: Omit<Annotation, "id" | "createdAt" | "updatedAt">): Annotation => {
    const full: Annotation = { ...a, id: uid(), createdAt: Date.now(), updatedAt: Date.now() };
    setAnnotations((prev) => [...prev, full]);
    return full;
  }, []);

  const updateAnnotation = useCallback((id: string, patch: Partial<Annotation>) => {
    setAnnotations((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n)));
  }, []);

  const removeAnnotation = useCallback((id: string) => {
    setAnnotations((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const addBookmark = useCallback((b: Omit<Bookmark, "id" | "createdAt">) => {
    setBookmarks((prev) => [...prev, { ...b, id: uid(), createdAt: Date.now() }]);
    toast("已添加书签", "success");
  }, [toast]);

  const removeBookmark = useCallback((id: string) => {
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const setProgress = useCallback((bookId: string, p: Omit<ProgressState, "updatedAt">) => {
    setProgressMap((prev) => ({ ...prev, [bookId]: { ...p, updatedAt: Date.now() } }));
  }, []);

  /* ---------- 导出文件（会话内） ---------- */
  const addExport = useCallback((e: Omit<ExportedFile, "id" | "createdAt">) => {
    setExports((prev) => [{ ...e, id: uid(), createdAt: Date.now() }, ...prev].slice(0, 40));
  }, []);
  const removeExport = useCallback((id: string) => {
    setExports((prev) => prev.filter((e) => e.id !== id));
  }, []);

  /* ---------- 阅读统计 ---------- */
  const addReadingTick = useCallback((seconds: number, pages: number) => {
    if (seconds <= 0 && pages <= 0) return;
    const key = todayKey();
    setStats((prev) => {
      const cur = prev[key] ?? { seconds: 0, pages: 0 };
      return { ...prev, [key]: { seconds: cur.seconds + seconds, pages: cur.pages + pages } };
    });
  }, []);

  const clearStats = useCallback(() => {
    setStats({});
    toast("阅读统计已清空", "info");
  }, [toast]);

  /* ---------- 快捷键 ---------- */
  const setKeybinding = useCallback((action: ShortcutAction, key: string) => {
    setKeybindings((prev) => {
      const next = { ...prev, [action]: key };
      try { localStorage.setItem(LS_KEYS, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const resetKeybindings = useCallback(() => {
    setKeybindings(DEFAULT_KEYS);
    try { localStorage.setItem(LS_KEYS, JSON.stringify(DEFAULT_KEYS)); } catch { /* ignore */ }
    toast("快捷键已恢复默认", "info");
  }, [toast]);

  /* ---------- OCR 缓存 ---------- */
  const getOcr = useCallback((bookId: string) => loadJSON<OcrBookMap>(`bv:ocr:${bookId}`, {}), []);

  /* ---------- 阅读器 ---------- */
  const openBook = useCallback((id: string) => {
    setActiveBookId(id);
    setView("reader");
  }, []);
  const closeReader = useCallback(() => {
    setView("shelf");
  }, []);

  const value = useMemo<AppContextValue>(() => ({
    ready, books, annotations, bookmarks, progress, exports, toasts, stats, keybindings,
    view, setView, activeBookId, openBook, closeReader,
    addFiles, importBatch, removeBook, updateBookMeta, getBlob,
    addAnnotation, updateAnnotation, removeAnnotation,
    addBookmark, removeBookmark, setProgress,
    addExport, removeExport,
    addReadingTick, clearStats, setKeybinding, resetKeybindings, getOcr,
    toast, dismissToast, pendingJump, setPendingJump, exportPickId, setExportPickId,
  }), [
    ready, books, annotations, bookmarks, progress, exports, toasts, stats, keybindings,
    view, activeBookId, openBook, closeReader, addFiles, importBatch, removeBook, updateBookMeta, getBlob,
    addAnnotation, updateAnnotation, removeAnnotation, addBookmark, removeBookmark,
    setProgress, addExport, removeExport, addReadingTick, clearStats, setKeybinding,
    resetKeybindings, getOcr, toast, dismissToast, pendingJump, exportPickId,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
