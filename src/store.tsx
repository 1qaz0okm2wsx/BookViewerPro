import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { set } from "idb-keyval";
import { KEYS, fileKey, loadJSON, saveJSON, del } from "./lib/idb";
import { buildSamples } from "./lib/samples";
import { detectFormat, titleFromFile } from "./lib/parse";
import { makeCover } from "./lib/cover";
import { uid, FORMAT_LABEL } from "./types";
import type {
  Annotation, BookMeta, Bookmark, ExportedFile, PendingJump,
  ProgressState, Toast, View,
} from "./types";

interface AppContextValue {
  ready: boolean;
  books: BookMeta[];
  annotations: Annotation[];
  bookmarks: Bookmark[];
  progress: Record<string, ProgressState>;
  exports: ExportedFile[];
  toasts: Toast[];
  view: View;
  setView: (v: View) => void;
  activeBookId: string | null;
  openBook: (id: string) => void;
  closeReader: () => void;
  addFiles: (files: FileList | File[]) => Promise<void>;
  removeBook: (id: string) => void;
  getBlob: (id: string) => Promise<Blob | undefined>;
  addAnnotation: (a: Omit<Annotation, "id" | "createdAt" | "updatedAt">) => Annotation;
  updateAnnotation: (id: string, patch: Partial<Annotation>) => void;
  removeAnnotation: (id: string) => void;
  addBookmark: (b: Omit<Bookmark, "id" | "createdAt">) => void;
  removeBookmark: (id: string) => void;
  setProgress: (bookId: string, p: Omit<ProgressState, "updatedAt">) => void;
  addExport: (e: Omit<ExportedFile, "id" | "createdAt">) => void;
  removeExport: (id: string) => void;
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
  const [view, setView] = useState<View>("shelf");
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [pendingJump, setPendingJump] = useState<PendingJump | null>(null);
  const [exportPickId, setExportPickId] = useState<string | null>(null);
  const timers = useRef<number[]>([]);

  /* ---------- 初始化：读取 IndexedDB，首次启动注入示例书库 ---------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
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
        if (cancelled) return;
        setBooks(list);
        setAnnotations(await loadJSON<Annotation[]>(KEYS.notes, []));
        setBookmarks(await loadJSON<Bookmark[]>(KEYS.marks, []));
        setProgressMap(await loadJSON<Record<string, ProgressState>>(KEYS.progress, {}));
      } catch (e) {
        console.error("初始化失败", e);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
      timers.current.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  /* ---------- 持久化 ---------- */
  useEffect(() => { if (ready) saveJSON(KEYS.books, books); }, [books, ready]);
  useEffect(() => { if (ready) saveJSON(KEYS.notes, annotations); }, [annotations, ready]);
  useEffect(() => { if (ready) saveJSON(KEYS.marks, bookmarks); }, [bookmarks, ready]);
  useEffect(() => { if (ready) saveJSON(KEYS.progress, progress); }, [progress, ready]);

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
  const addFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    const added: BookMeta[] = [];
    for (const file of list) {
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
      let cover: string | undefined;
      try {
        cover = await makeCover(title.slice(0, 12), "—", FORMAT_LABEL[format]);
      } catch {
        cover = undefined;
      }
      const meta: BookMeta = {
        id, title, author: "—", format, size: file.size,
        addedAt: Date.now(), cover, source: "user",
      };
      try {
        await set(fileKey(id), file);
        added.push(meta);
      } catch {
        toast(`《${title}》写入本地存储失败`, "error");
      }
    }
    if (added.length) {
      setBooks((prev) => [...added, ...prev]);
      toast(`已加入书架：${added.map((b) => `《${b.title}》`).join("、")}`);
    }
  }, [toast]);

  const removeBook = useCallback(async (id: string) => {
    const book = books.find((b) => b.id === id);
    try { await del(fileKey(id)); } catch { /* ignore */ }
    setBooks((prev) => prev.filter((b) => b.id !== id));
    setAnnotations((prev) => prev.filter((n) => n.bookId !== id));
    setBookmarks((prev) => prev.filter((n) => n.bookId !== id));
    setProgressMap((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (activeBookId === id) setActiveBookId(null);
    toast(book ? `已移除《${book.title}》及其笔记` : "已移除", "info");
  }, [books, activeBookId, toast]);

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

  /* ---------- 阅读器 ---------- */
  const openBook = useCallback((id: string) => {
    setActiveBookId(id);
    setView("reader");
  }, []);
  const closeReader = useCallback(() => {
    setView("shelf");
  }, []);

  const value = useMemo<AppContextValue>(() => ({
    ready, books, annotations, bookmarks, progress, exports, toasts,
    view, setView, activeBookId, openBook, closeReader,
    addFiles, removeBook, getBlob,
    addAnnotation, updateAnnotation, removeAnnotation,
    addBookmark, removeBookmark, setProgress,
    addExport, removeExport,
    toast, dismissToast, pendingJump, setPendingJump, exportPickId, setExportPickId,
  }), [
    ready, books, annotations, bookmarks, progress, exports, toasts,
    view, activeBookId, openBook, closeReader, addFiles, removeBook, getBlob,
    addAnnotation, updateAnnotation, removeAnnotation, addBookmark, removeBookmark,
    setProgress, addExport, removeExport, toast, dismissToast, pendingJump, exportPickId,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
