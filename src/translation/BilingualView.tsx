/** 动态双语对照：IntersectionObserver 捕获视口段落 → 上下文翻译 → 段落级缓存；支持一键全本翻译与双语导出 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { saveAs } from "file-saver";
import { useApp } from "../store";
import { parseBook } from "../lib/parse";
import { buildEpub } from "../lib/epub";
import { translate, translateBatch } from "./translator";
import { loadLlmSettings } from "../ai/llm";
import { Icon } from "../components/icons";
import { Btn, ProgressBar, Spinner } from "../components/ui";
import type { ParsedBook } from "../types";

interface Row {
  html: string;
  text: string;
  tr: string;
  loading: boolean;
}

/** 会话级翻译缓存：chapterKey → 与段落等长的译文数组 */
const sessionCache = new Map<string, string[]>();

function extractRows(html: string): Row[] {
  const doc = new DOMParser().parseFromString(`<div id="bv-b">${html}</div>`, "text/html");
  const root = doc.getElementById("bv-b");
  if (!root) return [];
  const rows: Row[] = [];
  Array.from(root.children).forEach((el) => {
    const text = (el.textContent ?? "").trim();
    if (text) rows.push({ html: el.outerHTML, text, tr: "", loading: false });
  });
  return rows;
}

export default function BilingualView() {
  const app = useApp();
  const textBooks = app.books.filter((b) => !["pdf", "image", "cbz"].includes(b.format));
  const [bookId, setBookId] = useState("");
  const [chapterIdx, setChapterIdx] = useState(0);
  const [parsed, setParsed] = useState<ParsedBook | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [layout, setLayout] = useState<"lr" | "tb">("lr");
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchProg, setBatchProg] = useState({ done: 0, total: 0 });
  const [wholeBusy, setWholeBusy] = useState(false);
  const [wholeProg, setWholeProg] = useState({ done: 0, total: 0 });
  const cancelRef = useRef(false);
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const listRef = useRef<HTMLDivElement>(null);

  const book = textBooks.find((b) => b.id === bookId) ?? null;
  const chapter = parsed?.chapters[chapterIdx] ?? null;
  const chapterKey = book && chapter ? `${book.id}:${chapter.id}` : "";

  /* 载入书与章节 */
  useEffect(() => {
    if (!book) { setParsed(null); setRows([]); return; }
    let cancelled = false;
    (async () => {
      const blob = await app.getBlob(book.id);
      if (!blob || cancelled) return;
      try {
        const p = await parseBook(book, blob);
        if (cancelled) return;
        setParsed(p);
        setChapterIdx(0);
      } catch (e) {
        app.toast(e instanceof Error ? e.message : "解析失败", "error");
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  useEffect(() => {
    if (!parsed || !chapterKey) { setRows([]); return; }
    const cached = sessionCache.get(chapterKey);
    const rs = extractRows(parsed.chapters[chapterIdx].html);
    if (cached) rs.forEach((r, i) => { r.tr = cached[i] ?? ""; });
    setRows(rs);
    rowRefs.current = [];
    listRef.current?.scrollTo({ top: 0 });
  }, [parsed, chapterIdx, chapterKey]);

  /* 所视即所译：视口内段落自动翻译 */
  useEffect(() => {
    const root = listRef.current;
    if (!root || !rows.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          const idx = Number((en.target as HTMLElement).dataset.idx);
          const row = rows[idx];
          if (!row || row.tr || row.loading || batchBusy) return;
          setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, loading: true } : r)));
          translate(row.text, bookId, { settings: loadLlmSettings() })
            .then((tr) => {
              setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, tr, loading: false } : r)));
              const arr = sessionCache.get(chapterKey) ?? new Array(rows.length).fill("");
              arr[idx] = tr;
              sessionCache.set(chapterKey, arr);
            })
            .catch(() => setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, tr: "（翻译失败，可重试）", loading: false } : r))));
        });
      },
      { root, rootMargin: "120px 0px" },
    );
    rowRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length, chapterKey, batchBusy, bookId]);

  const translateChapter = useCallback(async () => {
    if (!rows.length || batchBusy || !bookId) return;
    cancelRef.current = false;
    setBatchBusy(true);
    const missing = rows.map((r, i) => ({ i, text: r.text })).filter((x) => !rows[x.i].tr);
    const results = await translateBatch(
      missing.map((x) => x.text),
      bookId,
      (done: number, total: number) => setBatchProg({ done, total }),
      () => cancelRef.current,
      { settings: loadLlmSettings() },
    );
    setRows((prev) => {
      const next = prev.map((r) => ({ ...r }));
      missing.forEach((m, k) => { next[m.i].tr = results[k]; });
      sessionCache.set(chapterKey, next.map((r) => r.tr));
      return next;
    });
    setBatchBusy(false);
    app.toast("本章翻译完成");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, batchBusy, chapterKey, bookId]);

  /* 一键全本翻译 */
  const translateWhole = async () => {
    if (!parsed || !book || wholeBusy) return;
    cancelRef.current = false;
    setWholeBusy(true);
    const allTexts: string[] = [];
    const chapterRows = parsed.chapters.map((ch) => {
      const rs = extractRows(ch.html);
      rs.forEach((r) => allTexts.push(r.text));
      return rs;
    });
    const results = await translateBatch(
      allTexts,
      book.id,
      (done: number, total: number) => setWholeProg({ done, total }),
      () => cancelRef.current,
      { settings: loadLlmSettings() },
    );
    let k = 0;
    chapterRows.forEach((rs, ci) => {
      const key = `${book.id}:${parsed.chapters[ci].id}`;
      sessionCache.set(key, rs.map(() => results[k++]));
    });
    // 刷新当前章
    setRows((prev) => prev.map((r, i) => ({ ...r, tr: chapterRows[chapterIdx]?.[i] ? results[chapterRows.slice(0, chapterIdx).reduce((s, x) => s + x.length, 0) + i] ?? r.tr : r.tr })));
    setWholeBusy(false);
    if (!cancelRef.current) app.toast(`全本翻译完成（${allTexts.length} 段，已缓存）`);
  };

  const bilingualChapterHtml = (ci: number): string => {
    const rs = sessionCache.get(`${book!.id}:${parsed!.chapters[ci].id}`) ?? [];
    const base = extractRows(parsed!.chapters[ci].html);
    return base
      .map((r, i) => `${r.html}\n<p class="bv-tr" style="color:#8a6d3b;font-size:.92em;border-left:3px solid #c89b3c;padding-left:.8em;margin:.2em 0 1em">${rs[i] || "（未翻译）"}</p>`)
      .join("\n");
  };

  const exportEpub = async () => {
    if (!parsed || !book) return;
    const blob = await buildEpub({
      title: `${parsed.title}（双语对照）`,
      author: parsed.author,
      chapters: parsed.chapters.map((c, ci) => ({ title: c.title, html: bilingualChapterHtml(ci) })),
      version: 3,
    });
    saveAs(blob, `${book.title}_双语.epub`);
    app.toast("双语 EPUB 已导出");
  };

  const exportHtml = () => {
    if (!parsed || !book) return;
    const body = parsed.chapters
      .map((c, ci) => `<h2>${c.title}</h2>${bilingualChapterHtml(ci)}`)
      .join("\n<hr/>\n");
    const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"/><title>${parsed.title} · 双语对照</title>
<style>body{font-family:"Noto Serif SC",serif;max-width:46em;margin:2em auto;padding:0 1em;line-height:1.9;color:#2a322e}.bv-tr{color:#8a6d3b;font-size:.92em;border-left:3px solid #c89b3c;padding-left:.8em;margin:.2em 0 1em}</style>
</head><body><h1>${parsed.title}（双语对照）</h1>${body}</body></html>`;
    saveAs(new Blob([html], { type: "text/html;charset=utf-8" }), `${book.title}_双语.html`);
    app.toast("双语 HTML 已导出");
  };

  const doneCount = rows.filter((r) => r.tr).length;

  if (!textBooks.length) {
    return <p className="text-sm text-mist py-10 text-center">书库中没有可翻译的文本书籍（PDF/图片除外）。</p>;
  }

  return (
    <div className="grid lg:grid-cols-[300px_1fr] gap-5 items-start">
      {/* 控制列 */}
      <div className="space-y-4">
        <div>
          <p className="text-[10px] font-bold tracking-[0.2em] text-mist uppercase mb-1.5">书籍</p>
          <select value={bookId} onChange={(e) => setBookId(e.target.value)} className="w-full bg-paper border border-line rounded-md px-2.5 py-2 text-xs outline-none focus:border-verm cursor-pointer">
            <option value="">选择一本书…</option>
            {textBooks.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
          </select>
        </div>
        {parsed && (
          <div>
            <p className="text-[10px] font-bold tracking-[0.2em] text-mist uppercase mb-1.5">章节（{parsed.chapters.length}）</p>
            <select value={chapterIdx} onChange={(e) => setChapterIdx(+e.target.value)} className="w-full bg-paper border border-line rounded-md px-2.5 py-2 text-xs outline-none focus:border-verm cursor-pointer">
              {parsed.chapters.map((c, i) => <option key={c.id} value={i}>{i + 1}. {c.title}</option>)}
            </select>
          </div>
        )}
        <div>
          <p className="text-[10px] font-bold tracking-[0.2em] text-mist uppercase mb-1.5">版式</p>
          <div className="flex gap-1.5">
            <button onClick={() => setLayout("lr")} className={`flex-1 px-2 py-1.5 rounded-md text-xs font-bold border transition-all cursor-pointer ${layout === "lr" ? "bg-pine text-paper border-pine" : "border-line hover:border-ink/40"}`}>左右对照</button>
            <button onClick={() => setLayout("tb")} className={`flex-1 px-2 py-1.5 rounded-md text-xs font-bold border transition-all cursor-pointer ${layout === "tb" ? "bg-pine text-paper border-pine" : "border-line hover:border-ink/40"}`}>上下对照</button>
          </div>
        </div>
        {rows.length > 0 && (
          <div className="space-y-2">
            <Btn size="sm" className="w-full" onClick={translateChapter} disabled={batchBusy || doneCount === rows.length}>
              {batchBusy ? <Spinner size={13} /> : <Icon name="globe" size={13} />}
              {batchBusy ? `翻译中 ${batchProg.done}/${batchProg.total}` : doneCount === rows.length ? "本章已全部翻译" : `翻译本章（缺 ${rows.length - doneCount} 段）`}
            </Btn>
            <Btn size="sm" variant="dark" className="w-full" onClick={translateWhole} disabled={wholeBusy}>
              {wholeBusy ? <Spinner size={13} /> : <Icon name="book" size={13} />}
              {wholeBusy ? `全本翻译 ${wholeProg.done}/${wholeProg.total}` : "一键全本翻译"}
            </Btn>
            {(batchBusy || wholeBusy) && <ProgressBar value={(batchBusy ? batchProg : wholeProg).done / Math.max(1, (batchBusy ? batchProg : wholeProg).total)} />}
            {(batchBusy || wholeBusy) && <Btn size="sm" variant="ghost" className="w-full" onClick={() => { cancelRef.current = true; }}>中止</Btn>}
            <div className="h-px bg-line" />
            <Btn size="sm" variant="ghost" className="w-full" onClick={exportEpub}><Icon name="download" size={13} /> 导出双语 EPUB</Btn>
            <Btn size="sm" variant="ghost" className="w-full" onClick={exportHtml}><Icon name="download" size={13} /> 导出双语 HTML</Btn>
            <p className="text-[10px] text-mist leading-relaxed">译文按段落缓存于本地 IndexedDB，重读同段不再请求。缺 LLM 时自动回退在线免费接口。</p>
          </div>
        )}
      </div>

      {/* 对照区 */}
      <div ref={listRef} className="h-[56vh] overflow-y-auto bg-card border border-line rounded-xl p-5">
        {!book || !parsed ? (
          <div className="h-full flex flex-col items-center justify-center text-mist">
            <Icon name="globe" size={38} strokeWidth={1.2} className="mb-4 opacity-40" />
            <p className="text-sm">选择书籍后，滚动到任意段落即自动跟随翻译</p>
          </div>
        ) : !rows.length ? (
          <p className="text-xs text-mist py-10 text-center">本章没有可翻译的段落。</p>
        ) : (
          <div className="space-y-4">
            {rows.map((r, i) => (
              <div
                key={i}
                ref={(el) => { rowRefs.current[i] = el; }}
                data-idx={i}
                className={`rounded-lg border border-line/70 bg-paper/60 p-3.5 transition-colors hover:border-gold/50 ${layout === "lr" ? "grid md:grid-cols-2 gap-4" : ""}`}
              >
                <div className="rv-doc text-[15px]!" style={{ ["--rv-fg" as string]: "#2a322e" }} dangerouslySetInnerHTML={{ __html: r.html }} />
                <div className={`${layout === "tb" ? "mt-2.5 border-t border-dashed border-line pt-2.5" : ""}`}>
                  {r.loading ? (
                    <p className="text-xs text-mist flex items-center gap-2"><Spinner size={12} className="text-gold" /> 结合上下文翻译中…</p>
                  ) : r.tr ? (
                    <p className="text-[13px] leading-relaxed" style={{ color: "#8a6d3b" }}>{r.tr}</p>
                  ) : (
                    <p className="text-[11px] text-mist/60 italic">（滚动至此段将自动翻译）</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
