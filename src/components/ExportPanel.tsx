import React, { useEffect, useMemo, useState } from "react";
import { saveAs } from "file-saver";
import { useApp } from "../store";
import { exportBookZip, DEFAULT_ZIP_OPTIONS } from "../lib/exportZip";
import type { ZipOptions } from "../lib/exportZip";
import { Icon } from "./icons";
import { Btn, Spinner, Toggle, ViewHeader, EmptyState } from "./ui";
import { fmtSize, FORMAT_LABEL } from "../types";

export default function ExportPanel() {
  const app = useApp();
  const [bookId, setBookId] = useState<string>("");
  const [opts, setOpts] = useState<ZipOptions>(DEFAULT_ZIP_OPTIONS);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (app.exportPickId) {
      setBookId(app.exportPickId);
      app.setExportPickId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.exportPickId]);

  const book = app.books.find((b) => b.id === bookId) ?? app.books[0] ?? null;
  const notes = useMemo(() => app.annotations.filter((n) => n.bookId === book?.id), [app.annotations, book]);
  const marks = useMemo(() => app.bookmarks.filter((n) => n.bookId === book?.id), [app.bookmarks, book]);
  const prog = book ? app.progress[book.id] : undefined;
  const bookExports = useMemo(() => app.exports.filter((e) => e.bookId === book?.id), [app.exports, book]);

  const tree = useMemo(() => {
    if (!book) return [];
    const ext = book.format === "image" ? "png" : book.format;
    const t: Array<{ path: string; on: boolean }> = [
      { path: `${book.title}/原书/${book.title}.${ext}`, on: opts.includeOriginal },
      { path: `${book.title}/笔记/annotations.json`, on: opts.includeNotesJson && notes.length > 0 },
      { path: `${book.title}/笔记/notes.md`, on: opts.includeNotesMd && notes.length > 0 },
      { path: `${book.title}/笔记/annotations.csv`, on: opts.includeNotesCsv && notes.length > 0 },
      { path: `${book.title}/书签/bookmarks.json`, on: opts.includeBookmarks && marks.length > 0 },
      { path: `${book.title}/阅读进度/progress.json`, on: opts.includeProgress && Boolean(prog) },
      { path: `${book.title}/元数据/metadata.json`, on: opts.includeMeta },
      { path: `${book.title}/元数据/cover.jpg`, on: opts.includeMeta && Boolean(book.cover) },
      ...bookExports.map((e) => ({ path: `${book.title}/转换文件/${e.name}`, on: opts.includeExports })),
    ];
    return t;
  }, [book, opts, notes.length, marks.length, prog, bookExports]);

  const doExport = async () => {
    if (!book) return;
    setBusy(true);
    try {
      const blob = (await app.getBlob(book.id)) ?? null;
      const name = await exportBookZip({
        meta: book, blob, notes, bookmarks: marks, progress: prog,
        exports: opts.includeExports ? bookExports : [], options: opts,
      });
      app.toast(`已导出 ${name}`);
    } catch (e) {
      app.toast(e instanceof Error ? e.message : "导出失败", "error");
    } finally {
      setBusy(false);
    }
  };

  const setOpt = (k: keyof ZipOptions) => (v: boolean) => setOpts((o) => ({ ...o, [k]: v }));

  return (
    <div className="h-full overflow-y-auto app-bg">
      <div className="max-w-5xl mx-auto px-8 py-10">
        <ViewHeader
          kicker="Bundle · 打包"
          title="一键导出为 ZIP"
          desc="把书籍原文件、转换成果、全部笔记批注、书签与阅读进度打包成一个结构清晰的压缩包，随走随带。"
        />

        {!book ? (
          <EmptyState icon="box" title="书架为空" desc="先导入一本书，再回来打包导出。">
            <Btn onClick={() => app.setView("shelf")}><Icon name="library" size={15} /> 去书架</Btn>
          </EmptyState>
        ) : (
          <div className="grid lg:grid-cols-[1fr_380px] gap-8 items-start">
            <div className="space-y-6">
              <section className="anim-fadeUp">
                <h3 className="text-[11px] font-bold tracking-[0.22em] text-mist uppercase mb-3">① 选择书籍</h3>
                <div className="flex gap-2 flex-wrap">
                  {app.books.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => setBookId(b.id)}
                      className={`flex items-center gap-2.5 pl-2.5 pr-4 py-2 rounded-lg border transition-all cursor-pointer ${
                        book.id === b.id ? "border-verm bg-verm/[0.07] shadow-sm" : "border-line bg-card hover:border-ink/30"
                      }`}
                    >
                      {b.cover && <img src={b.cover} alt="" className="w-6 h-8 rounded-[2px] object-cover" />}
                      <span className="text-left">
                        <span className={`block text-xs font-bold max-w-[150px] truncate ${book.id === b.id ? "text-verm" : "text-ink"}`}>{b.title}</span>
                        <span className="block text-[10px] text-mist">{FORMAT_LABEL[b.format]} · {fmtSize(b.size)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="anim-fadeUp" style={{ animationDelay: "80ms" }}>
                <h3 className="text-[11px] font-bold tracking-[0.22em] text-mist uppercase mb-3">② 打包内容</h3>
                <div className="grid sm:grid-cols-2 gap-2.5">
                  <Toggle checked={opts.includeOriginal} onChange={setOpt("includeOriginal")} label="书籍原文件" desc={`${book.title}.${book.format === "image" ? "png" : book.format} · ${fmtSize(book.size)}`} />
                  <Toggle checked={opts.includeNotesJson} onChange={setOpt("includeNotesJson")} label="笔记 JSON" desc={`annotations.json · ${notes.length} 条（含偏移坐标）`} />
                  <Toggle checked={opts.includeNotesMd} onChange={setOpt("includeNotesMd")} label="笔记 Markdown" desc="notes.md · 人类可读的读书札记" />
                  <Toggle checked={opts.includeNotesCsv} onChange={setOpt("includeNotesCsv")} label="笔记 CSV" desc="annotations.csv · 便于 Excel 统计" />
                  <Toggle checked={opts.includeBookmarks} onChange={setOpt("includeBookmarks")} label="书签列表" desc={`bookmarks.json + md · ${marks.length} 枚`} />
                  <Toggle checked={opts.includeProgress} onChange={setOpt("includeProgress")} label="阅读进度" desc={prog ? `读到第 ${prog.chapterIndex + 1} 章 · ${Math.round(prog.percent * 100)}%` : "暂无进度记录"} />
                  <Toggle checked={opts.includeMeta} onChange={setOpt("includeMeta")} label="元数据与封面" desc="metadata.json + cover.jpg" />
                  <Toggle checked={opts.includeExports} onChange={setOpt("includeExports")} label="本次会话的转换文件" desc={bookExports.length ? `${bookExports.length} 个（转换器产出）` : "暂无，可先去「转换」页生成"} />
                </div>
              </section>

              <section className="anim-fadeUp" style={{ animationDelay: "140ms" }}>
                <h3 className="text-[11px] font-bold tracking-[0.22em] text-mist uppercase mb-3">③ 会话内的转换成果（{bookExports.length}）</h3>
                {bookExports.length === 0 ? (
                  <p className="text-xs text-mist bg-card border border-dashed border-line rounded-lg px-4 py-3.5">
                    在「转换」页生成的文件会暂存在这里，勾选「本次会话的转换文件」即可一并打包。
                    <button className="text-verm font-bold ml-1 cursor-pointer hover:underline" onClick={() => app.setView("convert")}>去转换 →</button>
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {bookExports.map((e) => (
                      <li key={e.id} className="flex items-center gap-3 bg-card border border-line rounded-lg px-3.5 py-2.5">
                        <Icon name="file" size={15} className="text-moss" />
                        <span className="text-xs font-bold truncate flex-1">{e.name}</span>
                        <span className="text-[10px] text-mist tabular-nums">{e.format} · {fmtSize(e.size)}</span>
                        <button onClick={() => saveAs(e.blob, e.name)} className="p-1.5 rounded-md text-mist hover:text-verm hover:bg-verm/10 transition-colors cursor-pointer" title="单独下载"><Icon name="download" size={14} /></button>
                        <button onClick={() => app.removeExport(e.id)} className="p-1.5 rounded-md text-mist hover:text-verm hover:bg-verm/10 transition-colors cursor-pointer" title="移出列表"><Icon name="x" size={14} /></button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <aside className="bg-pine text-paper rounded-xl p-5 cover-shadow anim-fadeUp lg:sticky lg:top-10" style={{ animationDelay: "120ms" }}>
              <h3 className="font-display font-bold text-base flex items-center gap-2 mb-3">
                <Icon name="zip" size={17} className="text-gold" /> 压缩包结构预览
              </h3>
              <div className="font-mono text-[11px] leading-[1.9] bg-black/25 rounded-lg p-3.5 max-h-72 overflow-y-auto">
                {tree.filter((t) => t.on).length === 0 && <p className="text-paper/40">（未勾选任何内容）</p>}
                {tree.map((t, i) => (
                  <div key={i} className={`whitespace-nowrap transition-opacity ${t.on ? "text-gold-soft" : "text-paper/25 line-through"}`}>
                    {t.on ? "▸ " : "· "}{t.path}
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-paper/50 mt-3 leading-relaxed">
                已勾选 <strong className="text-gold">{tree.filter((t) => t.on).length}</strong> 项内容 · 笔记以 JSON 保留精确文本偏移，可在重新导入后还原批注位置。
              </p>
              <Btn size="lg" variant="gold" className="w-full mt-4" onClick={doExport} disabled={busy || tree.filter((t) => t.on).length === 0}>
                {busy ? <Spinner size={17} /> : <Icon name="download" size={17} />}
                {busy ? "正在打包…" : "生成并下载 ZIP"}
              </Btn>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
