import React, { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../store";
import { parseBook, getCbzImage } from "../lib/parse";
import pdfjs from "../lib/pdf";
import { selectionToOffsets, wrapRange, unwrapAll } from "../lib/domrange";
import { Icon } from "./icons";
import type { IconName } from "./icons";
import { Btn, Spinner } from "./ui";
import { FORMAT_LABEL, fmtSize } from "../types";
import type { Annotation, NoteType, ParsedBook } from "../types";

const ANN_COLORS: Array<{ c: string; label: string }> = [
  { c: "#f5d67b", label: "金" },
  { c: "#bcd8b4", label: "青" },
  { c: "#f2a48d", label: "朱" },
  { c: "#a9c3e0", label: "蓝" },
];

const ANN_TYPES: Array<{ t: NoteType; icon: IconName; label: string }> = [
  { t: "highlight", icon: "highlighter", label: "高亮" },
  { t: "underline", icon: "underline", label: "下划线" },
  { t: "strike", icon: "strike", label: "删除线" },
  { t: "comment", icon: "comment", label: "批注" },
];

interface JumpReq {
  aid?: string;
  percent?: number;
  page?: number;
}

export default function ReaderView() {
  const app = useApp();
  const book = app.books.find((b) => b.id === app.activeBookId) ?? null;

  const [parsed, setParsed] = useState<ParsedBook | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [mode, setMode] = useState<"page" | "scroll">("page");
  const [zoom, setZoom] = useState(1);
  const [fontSize, setFontSize] = useState(18);
  const [lineHeight, setLineHeight] = useState(1.85);
  const [theme, setTheme] = useState<"paper" | "celadon" | "night">("paper");

  const [chapterIdx, setChapterIdx] = useState(0);
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [areaW, setAreaW] = useState(860);

  const [search, setSearch] = useState({ open: false, q: "", idx: 0, count: 0, version: 0 });
  const [tocOpen, setTocOpen] = useState(false);
  const [fsOpen, setFsOpen] = useState(false);
  const [isFull, setIsFull] = useState(false);
  const [annVersion, setAnnVersion] = useState(0);

  const [selBar, setSelBar] = useState<{ x: number; y: number; start: number; end: number; text: string } | null>(null);
  const [popover, setPopover] = useState<{ x: number; y: number; ann: Annotation } | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  const [pdfInfo, setPdfInfo] = useState<{ pages: number } | null>(null);
  const [imgIdx, setImgIdx] = useState(0);
  const [imgUrl, setImgUrl] = useState("");

  const shellRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const colRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const articleElRef = useRef<HTMLElement | null>(null);
  const pdfDocRef = useRef<{ getPage: (n: number) => Promise<{ getViewport: (o: { scale: number }) => { width: number; height: number }; render: (o: unknown) => { promise: Promise<void> } }> } | null>(null);
  const jumpRef = useRef<JumpReq | null>(null);
  const restoreRef = useRef<JumpReq | null>(null);
  const lastScrollPct = useRef(-1);

  const colW = Math.max(340, areaW) * zoom;
  const chapter = parsed?.kind === "chapters" ? parsed.chapters[Math.min(chapterIdx, parsed.chapters.length - 1)] : undefined;

  /* ---------- 打开书籍 ---------- */
  useEffect(() => {
    if (!book) return;
    setLoading(true);
    setError("");
    setParsed(null);
    setChapterIdx(0);
    setPage(0);
    setImgIdx(0);
    setPdfInfo(null);
    setSearch((s) => ({ ...s, q: "", idx: 0, count: 0 }));
    let cancelled = false;
    (async () => {
      try {
        const blob = await app.getBlob(book.id);
        if (!blob) throw new Error("本地存储中找不到该书文件，请重新导入");
        const p = await parseBook(book, blob);
        if (cancelled) return;
        setParsed(p);
        if (p.kind === "pdf" || p.kind === "image") setMode("scroll");
        const prev = app.progress[book.id];
        if (prev) {
          restoreRef.current = { percent: prev.percent, page: prev.page };
          if (p.kind === "chapters") setChapterIdx(Math.min(prev.chapterIndex, p.chapters.length - 1));
          if (p.kind === "pdf" && prev.page !== undefined) setPage(prev.page);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "打开失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book?.id]);

  /* ---------- 笔记/书签回跳（书已打开或刚加载完毕时生效） ---------- */
  useEffect(() => {
    const j = app.pendingJump;
    if (!j || !book || !parsed || j.bookId !== book.id) return;
    app.setPendingJump(null);
    if (j.chapterId && parsed.kind === "chapters") {
      const idx = parsed.chapters.findIndex((c) => c.id === j.chapterId);
      if (idx >= 0) setChapterIdx(idx);
      if (j.annotationId) jumpRef.current = { aid: j.annotationId };
      setAnnVersion((v) => v + 1);
    } else if (j.chapterIndex !== undefined) {
      if (parsed.kind === "chapters") setChapterIdx(Math.min(j.chapterIndex, parsed.chapters.length - 1));
      if (parsed.kind === "pdf" && j.page !== undefined) setPage(j.page);
      jumpRef.current = { percent: j.percent, page: j.page };
      setAnnVersion((v) => v + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.pendingJump, parsed, book?.id]);

  /* ---------- 区域尺寸 ---------- */
  useEffect(() => {
    const measure = () => { if (areaRef.current) setAreaW(areaRef.current.clientWidth || 860); };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  /* ---------- 分页测量 ---------- */
  useEffect(() => {
    if (mode !== "page" || !parsed || parsed.kind !== "chapters") return;
    const measure = () => {
      window.setTimeout(() => {
        const inner = colRef.current;
        if (!inner) return;
        const pages = Math.max(1, Math.round(inner.scrollWidth / colW));
        setPageCount(pages);
        const r = restoreRef.current;
        if (r) {
          restoreRef.current = null;
          const target = r.page !== undefined ? r.page : Math.round((r.percent ?? 0) * (pages - 1));
          setPage(Math.max(0, Math.min(pages - 1, target)));
        }
      }, 60);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, chapterIdx, annVersion, search.version, parsed, colW, fontSize, lineHeight]);

  /* ---------- 跳转请求（批注回跳 / 恢复位置） ---------- */
  useEffect(() => {
    if (!parsed || parsed.kind !== "chapters") return;
    const j = jumpRef.current;
    if (!j) return;
    jumpRef.current = null;
    window.setTimeout(() => {
      const root = scrollRef.current;
      if (!root) return;
      if (j.aid) {
        const el = root.querySelector(`[data-aid="${j.aid}"]`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
          el.classList.add("bv-flash");
          window.setTimeout(() => el.classList.remove("bv-flash"), 1900);
        }
      } else if (j.percent !== undefined && mode === "scroll") {
        root.scrollTop = (root.scrollHeight - root.clientHeight) * j.percent;
      } else if (j.page !== undefined && mode === "page") {
        goToPage(j.page);
      }
    }, 180);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, chapterIdx, annVersion, mode, search.version]);

  /* ---------- 搜索高亮统计 ---------- */
  useEffect(() => {
    if (!search.q.trim()) return;
    window.setTimeout(() => {
      const marks = scrollRef.current?.querySelectorAll("mark.bv-search");
      setSearch((s) => ({ ...s, count: marks?.length ?? 0, idx: 0 }));
      if (marks?.length) {
        marks.forEach((m, i) => m.classList.toggle("bv-search-cur", i === 0));
      }
    }, 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.q, search.version, chapterIdx, mode, annVersion]);

  /* ---------- 进度保存 ---------- */
  useEffect(() => {
    if (!book || !parsed) return;
    if (parsed.kind === "chapters") {
      const len = parsed.chapters.length || 1;
      const frac = mode === "page" && pageCount > 1 ? page / pageCount : mode === "scroll" ? 0.5 : 0;
      app.setProgress(book.id, { chapterIndex: chapterIdx, percent: Math.min(1, (chapterIdx + frac) / len), page: mode === "page" ? page : undefined });
    } else if (parsed.kind === "pdf" && pdfInfo) {
      app.setProgress(book.id, { chapterIndex: 0, percent: (page + 1) / pdfInfo.pages, page });
    } else if (parsed.kind === "image") {
      app.setProgress(book.id, { chapterIndex: 0, percent: parsed.imageCount > 1 ? imgIdx / parsed.imageCount : 1 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterIdx, page, pageCount, pdfInfo, imgIdx, mode, parsed, book?.id]);

  /* ---------- PDF 渲染 ---------- */
  useEffect(() => {
    if (!parsed || parsed.kind !== "pdf" || !parsed.pdfData) return;
    let cancelled = false;
    (async () => {
      try {
        const doc = await pdfjs.getDocument({ data: new Uint8Array(parsed.pdfData!.slice(0)) }).promise;
        if (cancelled) return;
        pdfDocRef.current = doc as unknown as typeof pdfDocRef.current;
        setPdfInfo({ pages: doc.numPages });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "PDF 渲染失败");
      }
    })();
    return () => { cancelled = true; };
  }, [parsed]);

  useEffect(() => {
    if (!pdfInfo || !pdfDocRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const pg = await pdfDocRef.current!.getPage(page + 1);
        if (cancelled) return;
        const vp1 = pg.getViewport({ scale: 1 });
        const scale = Math.min(2.6, (760 * zoom) / vp1.width);
        const vp = pg.getViewport({ scale });
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        await pg.render({ canvasContext: ctx, viewport: vp } as unknown).promise;
      } catch (e) {
        if (!cancelled) console.warn("PDF 页面渲染失败", e);
      }
    })();
    return () => { cancelled = true; };
  }, [pdfInfo, page, zoom]);

  /* ---------- CBZ / 图像 ---------- */
  useEffect(() => {
    if (!parsed || parsed.kind !== "image" || !book) return;
    if (parsed.format === "cbz") {
      setImgUrl("");
      getCbzImage(book.id, imgIdx).then((u) => setImgUrl(u)).catch(() => setImgUrl(""));
    } else {
      setImgUrl(parsed.imageDataUrl ?? "");
    }
  }, [parsed, imgIdx, book]);

  /* ---------- 键盘翻页 ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); goNext(); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); goPrev(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ---------- 批注包裹（每次重渲先解开旧包裹，避免重复嵌套） ---------- */
  const applyAnnotations = useCallback((el: HTMLElement | null, visible: boolean) => {
    if (!el || !book || !parsed || parsed.kind !== "chapters") return;
    const ch = parsed.chapters[chapterIdx];
    if (!ch) return;
    if (visible) articleElRef.current = el;
    unwrapAll(el, ".bv-ann");
    unwrapAll(el, "mark.bv-search");
    const q = search.q.trim();
    if (q) wrapSearch(el, q);
    const notes = app.annotations.filter((n) => n.bookId === book.id && n.chapterId === ch.id);
    notes.forEach((n) => {
      wrapRange(el, n.start, n.end, () => {
        const s = document.createElement("span");
        s.className = `bv-ann bv-ann-${n.type}`;
        s.dataset.aid = n.id;
        s.style.setProperty("--ann-color", n.color);
        s.addEventListener("click", (ev) => {
          ev.stopPropagation();
          openPopover(n, ev.currentTarget as HTMLElement);
        });
        return s;
      });
    });
    if (!visible) el.style.visibility = "hidden";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, parsed, chapterIdx, app.annotations, search.q, annVersion]);

  function wrapSearch(root: HTMLElement, q: string) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = (n as Text).parentElement;
        return p && p.tagName !== "SCRIPT" && p.tagName !== "STYLE" && p.tagName !== "MARK" ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    const targets: Array<{ node: Text; idx: number }> = [];
    let n: Node | null = walker.nextNode();
    const lq = q.toLowerCase();
    while (n) {
      const idx = (n as Text).data.toLowerCase().indexOf(lq);
      if (idx >= 0) targets.push({ node: n as Text, idx });
      n = walker.nextNode();
    }
    targets.forEach(({ node, idx }) => {
      try {
        const r = document.createRange();
        r.setStart(node, idx);
        r.setEnd(node, Math.min(node.data.length, idx + q.length));
        const m = document.createElement("mark");
        m.className = "bv-search";
        r.surroundContents(m);
      } catch { /* 跨节点匹配跳过 */ }
    });
  }

  /* ---------- 选区工具条 ---------- */
  const onAreaMouseUp = () => {
    window.setTimeout(() => {
      const root = articleElRef.current;
      if (!root || !book || !parsed || parsed.kind !== "chapters") return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) { setSelBar(null); return; }
      if (!root.contains(sel.anchorNode)) { setSelBar(null); return; }
      const off = selectionToOffsets(root);
      if (!off) { setSelBar(null); return; }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      const area = areaRef.current?.getBoundingClientRect();
      if (!area) return;
      setSelBar({
        x: Math.min(Math.max(8, rect.left - area.left + rect.width / 2), area.width - 8),
        y: Math.max(8, rect.top - area.top - 14),
        start: off.start, end: off.end, text: off.text,
      });
      setPopover(null);
    }, 10);
  };

  const [selType, setSelType] = useState<NoteType>("highlight");
  const [selColor, setSelColor] = useState(ANN_COLORS[0].c);

  const saveSelAnnotation = () => {
    if (!selBar || !book || !chapter) return;
    const ann = app.addAnnotation({
      bookId: book.id, chapterId: chapter.id, chapterTitle: chapter.title,
      type: selType, color: selColor, text: selBar.text, note: "",
      start: selBar.start, end: selBar.end,
    });
    setSelBar(null);
    window.getSelection()?.removeAllRanges();
    setAnnVersion((v) => v + 1);
    app.toast(selType === "comment" ? "已添加批注" : "已保存标注");
    if (selType === "comment") {
      window.setTimeout(() => {
        const el = scrollRef.current?.querySelector(`[data-aid="${ann.id}"]`) as HTMLElement | null;
        if (el) openPopover(ann, el);
      }, 120);
    }
  };

  const openPopover = (ann: Annotation, target: HTMLElement) => {
    setSelBar(null);
    const rect = target.getBoundingClientRect();
    const area = areaRef.current?.getBoundingClientRect();
    if (!area) return;
    setNoteDraft(ann.note);
    setPopover({
      x: Math.min(Math.max(8, rect.left - area.left + rect.width / 2), area.width - 8),
      y: Math.max(8, rect.bottom - area.top + 10),
      ann,
    });
  };

  const updatePopoverNote = () => {
    if (!popover) return;
    app.updateAnnotation(popover.ann.id, { note: noteDraft.trim() });
    setPopover(null);
    setAnnVersion((v) => v + 1);
    app.toast("批注已更新");
  };

  /* ---------- 翻页 ---------- */
  const goToPage = (p: number) => {
    const target = Math.max(0, p);
    setPage(target);
    scrollRef.current?.scrollTo({ left: target * colW, behavior: "smooth" });
  };

  const canPrev = (() => {
    if (!parsed) return false;
    if (parsed.kind === "pdf") return page > 0;
    if (parsed.kind === "image") return parsed.format === "cbz" && imgIdx > 0;
    return mode === "page" ? page > 0 || chapterIdx > 0 : chapterIdx > 0;
  })();
  const canNext = (() => {
    if (!parsed) return false;
    if (parsed.kind === "pdf") return pdfInfo ? page < pdfInfo.pages - 1 : false;
    if (parsed.kind === "image") return parsed.format === "cbz" && imgIdx < parsed.imageCount - 1;
    return mode === "page" ? page < pageCount - 1 || chapterIdx < parsed.chapters.length - 1 : chapterIdx < parsed.chapters.length - 1;
  })();

  const goPrev = () => {
    if (!parsed) return;
    if (parsed.kind === "pdf") { if (page > 0) goToPage(page - 1); return; }
    if (parsed.kind === "image") { if (imgIdx > 0) setImgIdx(imgIdx - 1); return; }
    if (mode === "page") {
      if (page > 0) goToPage(page - 1);
      else if (chapterIdx > 0) { setChapterIdx(chapterIdx - 1); setPage(0); }
    } else if (chapterIdx > 0) setChapterIdx(chapterIdx - 1);
  };
  const goNext = () => {
    if (!parsed) return;
    if (parsed.kind === "pdf") { if (pdfInfo && page < pdfInfo.pages - 1) goToPage(page + 1); return; }
    if (parsed.kind === "image") { if (parsed.format === "cbz" && imgIdx < parsed.imageCount - 1) setImgIdx(imgIdx + 1); return; }
    if (mode === "page") {
      if (page < pageCount - 1) goToPage(page + 1);
      else if (chapterIdx < parsed.chapters.length - 1) { setChapterIdx(chapterIdx + 1); setPage(0); }
    } else if (chapterIdx < parsed.chapters.length - 1) setChapterIdx(chapterIdx + 1);
  };

  const onPagedScroll = () => {
    const sc = scrollRef.current;
    if (!sc) return;
    const p = Math.max(0, Math.round(sc.scrollLeft / colW));
    setPage((old) => (old === p ? old : p));
  };

  const onScrollMode = () => {
    if (!book || !parsed) return;
    const sc = scrollRef.current;
    if (!sc) return;
    const pct = sc.scrollHeight > sc.clientHeight ? sc.scrollTop / (sc.scrollHeight - sc.clientHeight) : 1;
    const len = parsed.kind === "chapters" ? parsed.chapters.length : 1;
    const total = Math.min(1, (chapterIdx + pct) / len);
    if (Math.abs(total - lastScrollPct.current) < 0.02) return;
    lastScrollPct.current = total;
    app.setProgress(book.id, { chapterIndex: chapterIdx, percent: total });
  };

  const onPdfScroll = () => {
    const sc = scrollRef.current;
    if (!sc || !pdfInfo) return;
    if (sc.scrollTop + sc.clientHeight > sc.scrollHeight - 160 && page < pdfInfo.pages - 1) {
      setPage(page + 1);
    }
  };

  /* ---------- 书签 ---------- */
  const toggleBookmark = () => {
    if (!book || !parsed) return;
    const pageNum = parsed.kind === "pdf" ? page : undefined;
    const existing = app.bookmarks.find((b) => b.bookId === book.id && b.chapterIndex === chapterIdx && b.page === pageNum);
    if (existing) {
      app.removeBookmark(existing.id);
      app.toast("已移除书签", "info");
      return;
    }
    app.addBookmark({
      bookId: book.id,
      chapterIndex: chapterIdx,
      percent: 0,
      page: pageNum,
      label: parsed.kind === "chapters" ? chapter?.title ?? "" : parsed.kind === "pdf" ? `第 ${page + 1} 页` : "图像",
    });
  };
  const isMarked = Boolean(book && app.bookmarks.some((b) =>
    b.bookId === book.id && b.chapterIndex === chapterIdx && b.page === (parsed?.kind === "pdf" ? page : undefined)));

  const toggleFull = () => {
    const el = shellRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().then(() => setIsFull(true)).catch(() => setIsFull((v) => !v));
    } else {
      document.exitFullscreen?.().then(() => setIsFull(false)).catch(() => {});
    }
  };
  useEffect(() => {
    const onFs = () => setIsFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const searchStep = (dir: 1 | -1) => {
    const root = scrollRef.current;
    if (!root) return;
    const marks = Array.from(root.querySelectorAll("mark.bv-search"));
    if (!marks.length) return;
    const next = (search.idx + dir + marks.length) % marks.length;
    marks.forEach((m, i) => m.classList.toggle("bv-search-cur", i === next));
    const cur = marks[next];
    if (mode === "page" && parsed?.kind === "chapters") {
      const col = (cur as HTMLElement).closest(".rv-pagecol") as HTMLElement | null;
      if (col) goToPage(Math.round(col.offsetLeft / colW));
    } else {
      cur.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    setSearch((s) => ({ ...s, idx: next }));
  };

  /* ================= 渲染 ================= */

  if (!book) {
    return (
      <div className="h-full app-bg flex items-center justify-center">
        <div className="text-center anim-fadeUp max-w-md px-6">
          <div className="w-16 h-16 rounded-2xl bg-pine text-gold-soft flex items-center justify-center mx-auto mb-5 rotate-3 anim-breathe">
            <Icon name="bookOpen" size={30} strokeWidth={1.5} />
          </div>
          <h2 className="font-display font-black text-2xl mb-2">阅读台虚位以待</h2>
          <p className="text-sm text-mist leading-relaxed mb-6">从书架挑一本书开始阅读；支持分页与滚动两种模式、全文搜索、四色批注与书签。</p>
          {app.books.length > 0 ? (
            <Btn onClick={() => app.openBook(app.books[0].id)}><Icon name="bookOpen" size={15} /> 打开《{app.books[0].title}》</Btn>
          ) : (
            <Btn onClick={() => app.setView("shelf")}><Icon name="library" size={15} /> 先去书架导入</Btn>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full app-bg flex flex-col items-center justify-center gap-4">
        <Spinner size={30} className="text-verm" />
        <p className="text-sm text-ink-soft anim-fadeIn">正在打开《{book.title}》…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full app-bg flex items-center justify-center px-6">
        <div className="bg-card border border-verm/40 rounded-xl p-8 max-w-md text-center anim-pop">
          <div className="w-12 h-12 rounded-xl bg-verm/10 text-verm flex items-center justify-center mx-auto mb-4"><Icon name="alert" size={24} /></div>
          <h2 className="font-display font-black text-lg mb-2">打开失败</h2>
          <p className="text-sm text-mist leading-relaxed mb-5">{error}</p>
          <div className="flex gap-2 justify-center">
            <Btn variant="ghost" onClick={() => app.setView("shelf")}><Icon name="chevL" size={15} /> 返回书架</Btn>
            <Btn onClick={() => window.location.reload()}>重试</Btn>
          </div>
        </div>
      </div>
    );
  }

  if (!parsed) return null;

  const themeBtn = (t: "paper" | "celadon" | "night", bg: string, label: string) => (
    <button
      key={t}
      onClick={() => setTheme(t)}
      title={label}
      className={`w-8 h-8 rounded-full border-2 transition-all cursor-pointer ${theme === t ? "border-verm scale-110" : "border-line hover:border-ink/40"}`}
      style={{ background: bg }}
    />
  );

  return (
    <div ref={shellRef} className={`h-full flex flex-col relative ${isFull ? "bg-pine" : ""}`}>
      {/* ===== 顶栏 ===== */}
      <div className="flex items-center gap-1 px-3 py-2 bg-pine text-paper/90 shrink-0 relative z-20 shadow-[0_2px_10px_-4px_rgba(0,0,0,.4)]">
        <button onClick={() => app.setView("shelf")} title="返回书架" className="p-2 rounded-md hover:bg-white/10 transition-colors cursor-pointer">
          <Icon name="chevL" size={17} />
        </button>
        <div className="min-w-0 flex-1 ml-1">
          <p className="font-display font-bold text-[15px] truncate leading-tight">{book.title}</p>
          <p className="text-[10px] text-paper/45 truncate leading-tight">
            {book.author} · {FORMAT_LABEL[book.format]}
            {parsed.kind === "chapters" && chapter ? ` · ${chapter.title}` : ""}
            {parsed.kind === "pdf" && pdfInfo ? ` · 共 ${pdfInfo.pages} 页` : ""}
          </p>
        </div>

        {parsed.kind === "chapters" && parsed.chapters.length > 1 && (
          <button onClick={() => setTocOpen(true)} title="目录" className="p-2 rounded-md hover:bg-white/10 transition-colors cursor-pointer">
            <Icon name="list" size={17} />
          </button>
        )}

        <div className="relative">
          <button
            onClick={() => setSearch((s) => ({ ...s, open: !s.open }))}
            title="全文搜索"
            className={`p-2 rounded-md transition-colors cursor-pointer ${search.open ? "bg-white/15 text-gold" : "hover:bg-white/10"}`}
          >
            <Icon name="search" size={17} />
          </button>
          {search.open && parsed.kind === "chapters" && (
            <div className="absolute right-0 top-[calc(100%+10px)] bg-card text-ink border border-line rounded-lg shadow-2xl p-3 w-72 z-40 anim-pop">
              <input
                autoFocus
                value={search.q}
                onChange={(e) => setSearch((s) => ({ ...s, q: e.target.value, version: s.version + 1 }))}
                placeholder="输入关键词，全文高亮…"
                className="w-full bg-paper border border-line rounded-md px-2.5 py-1.5 text-xs outline-none focus:border-verm transition-colors"
              />
              <div className="flex items-center justify-between mt-2 text-[11px] text-mist">
                <span className="tabular-nums">{search.q ? `第 ${search.count ? search.idx + 1 : 0} / ${search.count} 处` : "等待输入"}</span>
                <span className="flex items-center gap-0.5">
                  <button onClick={() => searchStep(-1)} className="p-1 rounded hover:bg-line/60 cursor-pointer"><Icon name="chevL" size={14} /></button>
                  <button onClick={() => searchStep(1)} className="p-1 rounded hover:bg-line/60 cursor-pointer"><Icon name="chevR" size={14} /></button>
                  <button onClick={() => setSearch({ open: false, q: "", idx: 0, count: 0, version: search.version + 1 })} className="p-1 rounded hover:bg-line/60 cursor-pointer"><Icon name="x" size={14} /></button>
                </span>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={toggleBookmark}
          title={isMarked ? "移除书签" : "添加书签"}
          className={`p-2 rounded-md transition-all cursor-pointer ${isMarked ? "text-gold bg-white/10" : "hover:bg-white/10"}`}
        >
          <Icon name="bookmark" size={17} className={isMarked ? "fill-current" : ""} />
        </button>

        <div className="relative">
          <button
            onClick={() => setFsOpen((v) => !v)}
            title="阅读设置"
            className={`p-2 rounded-md transition-colors cursor-pointer ${fsOpen ? "bg-white/15 text-gold" : "hover:bg-white/10"}`}
          >
            <Icon name="settings" size={17} />
          </button>
          {fsOpen && (
            <div className="absolute right-0 top-[calc(100%+10px)] w-[272px] bg-card text-ink border border-line rounded-lg shadow-2xl p-4 z-40 anim-pop space-y-4">
              <div>
                <p className="text-[10px] font-bold tracking-[0.2em] text-mist uppercase mb-1.5">阅读模式</p>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => { setMode("page"); setAnnVersion((v) => v + 1); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-bold border transition-all cursor-pointer ${mode === "page" ? "bg-pine text-paper border-pine" : "border-line hover:border-ink/40"}`}
                  ><Icon name="columns" size={13} /> 分页</button>
                  <button
                    onClick={() => { setMode("scroll"); setAnnVersion((v) => v + 1); }}
                    disabled={parsed.kind !== "chapters"}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-bold border transition-all cursor-pointer disabled:opacity-35 ${mode === "scroll" ? "bg-pine text-paper border-pine" : "border-line hover:border-ink/40"}`}
                  ><Icon name="rows" size={13} /> 滚动</button>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-[0.2em] text-mist uppercase mb-1.5">字号 · {fontSize}px</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setFontSize((s) => Math.max(13, s - 1))} className="p-1 rounded border border-line hover:border-ink/40 cursor-pointer"><Icon name="minus" size={13} /></button>
                  <input type="range" min={13} max={30} value={fontSize} onChange={(e) => setFontSize(+e.target.value)} className="bv-range flex-1" />
                  <button onClick={() => setFontSize((s) => Math.min(30, s + 1))} className="p-1 rounded border border-line hover:border-ink/40 cursor-pointer"><Icon name="plus" size={13} /></button>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-[0.2em] text-mist uppercase mb-1.5">行距 · {lineHeight.toFixed(2)}</p>
                <input type="range" min={1.4} max={2.4} step={0.05} value={lineHeight} onChange={(e) => setLineHeight(+e.target.value)} className="bv-range w-full" />
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-[0.2em] text-mist uppercase mb-1.5">底色</p>
                <div className="flex items-center gap-2.5">
                  {themeBtn("paper", "#fcfbf6", "纸白")}
                  {themeBtn("celadon", "#e6ede4", "青瓷")}
                  {themeBtn("night", "#171b1e", "夜读")}
                  <span className="text-[11px] text-mist ml-1">{{ paper: "纸白", celadon: "青瓷", night: "夜读" }[theme]}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <button onClick={toggleFull} title="全屏阅读" className="p-2 rounded-md hover:bg-white/10 transition-colors cursor-pointer">
          <Icon name={isFull ? "shrink" : "expand"} size={17} />
        </button>
      </div>

      {/* ===== 阅读区 ===== */}
      <div
        ref={areaRef}
        className={`relative flex-1 overflow-hidden theme-${theme}`}
        style={{ background: "var(--rv-bg)", ["--rv-fs" as string]: `${fontSize}px`, ["--rv-lh" as string]: lineHeight }}
        onMouseUp={onAreaMouseUp}
        onMouseDown={() => { setPopover(null); }}
      >
        {parsed.kind === "chapters" && chapter && mode === "page" && (
          <div ref={scrollRef} onScroll={onPagedScroll} className="h-full overflow-x-auto overflow-y-hidden" style={{ scrollSnapType: "x mandatory" }}>
            <div
              ref={colRef}
              className="rv-col h-full"
              style={{ display: "grid", gridAutoFlow: "column", gridAutoColumns: `${colW}px`, height: "100%" }}
            >
              {Array.from({ length: pageCount }, (_, p) => (
                <div key={p} className="rv-pagecol h-full overflow-hidden" style={{ scrollSnapAlign: "start" }}>
                  <div
                    ref={(el) => applyAnnotations(el, p === 0)}
                    className="rv-doc h-full overflow-hidden"
                    style={{ height: "100%", columnFill: "auto" }}
                    dangerouslySetInnerHTML={{ __html: chapter.html }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {parsed.kind === "chapters" && chapter && mode === "scroll" && (
          <div ref={scrollRef} onScroll={onScrollMode} className="h-full overflow-y-auto">
            <article
              ref={(el) => applyAnnotations(el, true)}
              className="rv-doc max-w-[42rem] mx-auto px-8 py-12"
              dangerouslySetInnerHTML={{ __html: chapter.html }}
            />
            <div className="text-center pb-10 text-xs" style={{ color: "var(--rv-muted)" }}>
              —— 本章完 · {chapterIdx < parsed.chapters.length - 1 ? "点击右侧箭头进入下一章" : "已是最后一章"} ——
            </div>
          </div>
        )}

        {parsed.kind === "pdf" && (
          <div ref={scrollRef} onScroll={onPdfScroll} className="h-full overflow-y-auto" style={{ background: "color-mix(in srgb, var(--rv-bg) 92%, #000)" }}>
            <div className="flex flex-col items-center gap-6 py-8 px-4 min-h-full">
              <canvas ref={canvasRef} className="rounded-[3px] shadow-[0_16px_48px_-16px_rgba(0,0,0,0.55)] bg-white" style={{ width: `${Math.round(760 * zoom)}px`, maxWidth: "96%" }} />
              {pdfInfo && page < pdfInfo.pages - 1 && (
                <button onClick={() => goToPage(page + 1)} className="px-4 py-2 rounded-md text-xs font-bold bg-pine text-paper hover:bg-pine-2 transition-colors cursor-pointer shadow-lg">
                  加载第 {page + 2} 页 ↓
                </button>
              )}
              {pdfInfo && (
                <p className="text-[11px] pb-4" style={{ color: "var(--rv-muted)" }}>第 {page + 1} / {pdfInfo.pages} 页 · 滚轮向下自动续页</p>
              )}
            </div>
          </div>
        )}

        {parsed.kind === "image" && (
          <div className="h-full overflow-auto flex items-center justify-center p-6" style={{ background: "color-mix(in srgb, var(--rv-bg) 94%, #000)" }}>
            {imgUrl ? (
              <img
                src={imgUrl}
                alt={book.title}
                className="rounded-md cover-shadow transition-transform duration-300"
                style={{ maxWidth: "94%", maxHeight: "88%", transform: `scale(${zoom})`, transformOrigin: "center" }}
                draggable={false}
              />
            ) : (
              <Spinner size={28} className="text-verm" />
            )}
          </div>
        )}

        {/* 选区工具条 */}
        {selBar && (
          <div
            className="absolute z-40 -translate-x-1/2 -translate-y-full anim-pop"
            style={{ left: selBar.x, top: selBar.y }}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
          >
            <div className="bg-pine text-paper rounded-lg shadow-2xl border border-white/10 px-2.5 py-2 flex items-center gap-1.5">
              {ANN_TYPES.map((t) => (
                <button
                  key={t.t}
                  title={t.label}
                  onClick={() => setSelType(t.t)}
                  className={`p-1.5 rounded-md transition-all cursor-pointer ${selType === t.t ? "bg-verm text-white" : "hover:bg-white/10"}`}
                >
                  <Icon name={t.icon} size={15} />
                </button>
              ))}
              <span className="w-px h-5 bg-white/15" />
              {ANN_COLORS.map((c) => (
                <button
                  key={c.c}
                  title={c.label}
                  onClick={() => setSelColor(c.c)}
                  className={`w-5 h-5 rounded-full border-2 transition-all cursor-pointer ${selColor === c.c ? "border-white scale-115" : "border-transparent hover:scale-110"}`}
                  style={{ background: c.c, transform: selColor === c.c ? "scale(1.18)" : undefined }}
                />
              ))}
              <span className="w-px h-5 bg-white/15" />
              <button onClick={saveSelAnnotation} className="px-2.5 py-1.5 rounded-md bg-gold text-pine text-xs font-black hover:brightness-110 transition-all cursor-pointer">
                记下
              </button>
            </div>
            <div className="w-2.5 h-2.5 bg-pine rotate-45 mx-auto -mt-[5px] border-r border-b border-white/10" />
          </div>
        )}

        {/* 批注弹层 */}
        {popover && (
          <div
            className="absolute z-40 -translate-x-1/2 anim-pop w-72"
            style={{ left: popover.x, top: popover.y }}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
          >
            <div className="bg-card border border-line rounded-lg shadow-2xl p-3.5">
              <p className="text-[10px] font-bold text-mist tracking-wider uppercase mb-1.5 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: popover.ann.color }} />
                {popover.ann.chapterTitle} · 批注
              </p>
              <p className="text-xs leading-relaxed text-ink-soft border-l-2 pl-2 mb-2.5" style={{ borderColor: popover.ann.color }}>
                「{popover.ann.text}」
              </p>
              <textarea
                autoFocus
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                rows={3}
                placeholder="写点什么…"
                className="w-full bg-paper border border-line rounded-md px-2.5 py-2 text-xs outline-none focus:border-verm resize-none transition-colors"
              />
              <div className="flex items-center gap-1.5 mt-2.5">
                {ANN_COLORS.map((c) => (
                  <button
                    key={c.c}
                    onClick={() => { app.updateAnnotation(popover.ann.id, { color: c.c }); setPopover({ ...popover, ann: { ...popover.ann, color: c.c } }); }}
                    className="w-4.5 h-4.5 rounded-full border transition-transform hover:scale-110 cursor-pointer"
                    style={{ background: c.c, width: 17, height: 17, borderColor: popover.ann.color === c.c ? "var(--color-ink)" : "transparent" }}
                  />
                ))}
                <span className="flex-1" />
                <button
                  onClick={() => { app.removeAnnotation(popover.ann.id); setPopover(null); setAnnVersion((v) => v + 1); app.toast("已删除", "info"); }}
                  className="p-1.5 rounded-md text-mist hover:text-verm hover:bg-verm/10 transition-colors cursor-pointer" title="删除批注"
                >
                  <Icon name="trash" size={14} />
                </button>
                <Btn size="sm" onClick={updatePopoverNote}><Icon name="check" size={13} /> 保存</Btn>
              </div>
            </div>
          </div>
        )}

        {/* 目录抽屉 */}
        {tocOpen && parsed.kind === "chapters" && (
          <div className="absolute inset-0 z-30">
            <div className="absolute inset-0 bg-pine/45 anim-fadeIn" onClick={() => setTocOpen(false)} />
            <div className="absolute left-0 top-0 h-full w-[300px] bg-card border-r border-line shadow-2xl anim-slideR flex flex-col">
              <div className="flex items-center justify-between px-5 py-4 border-b border-line">
                <h3 className="font-display font-black text-lg">目录</h3>
                <span className="text-[11px] text-mist">{parsed.chapters.length} 章 · {fmtSize(book.size)}</span>
                <button onClick={() => setTocOpen(false)} className="p-1.5 rounded-md text-mist hover:text-ink hover:bg-line/60 transition-colors cursor-pointer"><Icon name="x" size={15} /></button>
              </div>
              <ul className="flex-1 overflow-y-auto p-2.5 space-y-0.5">
                {parsed.chapters.map((c, i) => (
                  <li key={c.id}>
                    <button
                      onClick={() => { setChapterIdx(i); setPage(0); setTocOpen(false); scrollRef.current?.scrollTo({ left: 0, top: 0 }); }}
                      className={`w-full text-left px-3 py-2.5 rounded-md text-[13px] transition-all cursor-pointer flex items-center gap-2.5 ${
                        i === chapterIdx ? "bg-pine text-paper font-bold shadow" : "text-ink-soft hover:bg-line/50"
                      }`}
                    >
                      <span className={`text-[10px] tabular-nums shrink-0 ${i === chapterIdx ? "text-gold" : "text-mist"}`}>{String(i + 1).padStart(2, "0")}</span>
                      <span className="truncate">{c.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* ===== 底栏 ===== */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-pine text-paper/85 shrink-0 relative z-20">
        <button onClick={goPrev} disabled={!canPrev} className="p-2 rounded-md hover:bg-white/10 disabled:opacity-30 transition-all cursor-pointer" title="上一页（←）">
          <Icon name="chevL" size={17} />
        </button>

        {parsed.kind === "chapters" && mode === "page" && (
          <>
            <input
              type="range" min={0} max={Math.max(0, pageCount - 1)} value={Math.min(page, pageCount - 1)}
              onChange={(e) => goToPage(+e.target.value)}
              className="bv-range flex-1"
            />
            <span className="text-xs tabular-nums whitespace-nowrap w-24 text-center">{page + 1} / {pageCount} 页</span>
          </>
        )}
        {parsed.kind === "chapters" && mode === "scroll" && (
          <div className="flex-1 flex items-center justify-center gap-2 text-xs">
            <span className="text-paper/45">第 {chapterIdx + 1} / {parsed.chapters.length} 章</span>
            <div className="w-40 h-1 rounded-full bg-white/15 overflow-hidden">
              <div className="h-full bg-gold transition-all duration-500" style={{ width: `${((chapterIdx + 1) / parsed.chapters.length) * 100}%` }} />
            </div>
          </div>
        )}
        {parsed.kind === "pdf" && pdfInfo && (
          <>
            <input
              type="range" min={0} max={pdfInfo.pages - 1} value={page}
              onChange={(e) => goToPage(+e.target.value)}
              className="bv-range flex-1"
            />
            <span className="text-xs tabular-nums whitespace-nowrap w-24 text-center">{page + 1} / {pdfInfo.pages} 页</span>
          </>
        )}
        {parsed.kind === "image" && (
          <span className="flex-1 text-center text-xs">
            {parsed.format === "cbz" ? `第 ${imgIdx + 1} / ${parsed.imageCount} 页` : "单幅图像 · 滚轮缩放"}
          </span>
        )}

        <button onClick={goNext} disabled={!canNext} className="p-2 rounded-md hover:bg-white/10 disabled:opacity-30 transition-all cursor-pointer" title="下一页（→）">
          <Icon name="chevR" size={17} />
        </button>

        <span className="w-px h-5 bg-white/15" />
        <button onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))} className="p-2 rounded-md hover:bg-white/10 transition-colors cursor-pointer" title="缩小">
          <Icon name="zoomOut" size={16} />
        </button>
        <span className="text-[11px] tabular-nums w-10 text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.1).toFixed(2)))} className="p-2 rounded-md hover:bg-white/10 transition-colors cursor-pointer" title="放大">
          <Icon name="zoomIn" size={16} />
        </button>
        <button onClick={() => setZoom(1)} className="text-[10px] px-1.5 py-1 rounded hover:bg-white/10 transition-colors cursor-pointer text-paper/60" title="重置缩放">
          适应
        </button>

        <span className="hidden md:flex items-center gap-1.5 ml-2 text-[10px] text-paper/40">
          <kbd className="bv-kbd">←</kbd><kbd className="bv-kbd">→</kbd> 翻页
          <span className="mx-1">·</span> 选中文字可批注
        </span>
      </div>
    </div>
  );
}
