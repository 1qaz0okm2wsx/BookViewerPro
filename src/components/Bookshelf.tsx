import React, { useMemo, useRef, useState } from "react";
import { useApp } from "../store";
import { Icon } from "./icons";
import { Btn, EmptyState, Modal, ProgressBar, ViewHeader } from "./ui";
import { fmtSize, FORMAT_LABEL, FORMAT_COLOR } from "../types";
import type { BookMeta } from "../types";

export default function Bookshelf() {
  const app = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [q, setQ] = useState("");
  const [confirmDel, setConfirmDel] = useState<BookMeta | null>(null);

  const books = useMemo(() => {
    const t = q.trim().toLowerCase();
    return app.books.filter((b) => !t || b.title.toLowerCase().includes(t) || b.author.toLowerCase().includes(t));
  }, [app.books, q]);

  const totalSize = useMemo(() => app.books.reduce((s, b) => s + b.size, 0), [app.books]);

  const continueBook = useMemo(() => {
    const withProg = app.books.filter((b) => app.progress[b.id]);
    if (!withProg.length) return null;
    return withProg.sort((a, b) => (app.progress[b.id]?.updatedAt ?? 0) - (app.progress[a.id]?.updatedAt ?? 0))[0];
  }, [app.books, app.progress]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    if (e.dataTransfer.files?.length) app.addFiles(e.dataTransfer.files);
  };

  return (
    <div
      className={`h-full overflow-y-auto app-bg transition-shadow ${drag ? "shadow-[inset_0_0_0_3px_var(--color-verm)]" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
    >
      <div className="max-w-6xl mx-auto px-8 py-10">
        <ViewHeader
          kicker="Library · 藏书阁"
          title="我的书架"
          desc="拖拽文件到任意位置即可入库。EPUB、PDF、DOCX、CBZ、FB2、MOBI、Markdown、TXT、HTML、SVG 与常见图片均可阅读。"
          right={
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 bg-card border border-line rounded-md px-3 py-2 focus-within:border-verm transition-colors">
                <Icon name="search" size={14} className="text-mist" />
                <input
                  value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索书名 / 作者"
                  className="bg-transparent outline-none text-xs w-36"
                />
              </div>
              <Btn onClick={() => fileRef.current?.click()}><Icon name="upload" size={15} /> 导入书籍</Btn>
              <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) app.addFiles(e.target.files); e.target.value = ""; }} />
            </div>
          }
        />

        {/* 拖拽提示浮层 */}
        {drag && (
          <div className="fixed inset-0 z-50 bg-pine/60 backdrop-blur-sm flex items-center justify-center pointer-events-none anim-fadeIn">
            <div className="bg-card border-2 border-dashed border-verm rounded-2xl px-14 py-12 text-center anim-pop">
              <Icon name="download" size={42} className="text-verm mx-auto mb-3" />
              <p className="font-display font-black text-xl">松开即入库</p>
              <p className="text-xs text-mist mt-1.5">支持一次拖入多个文件</p>
            </div>
          </div>
        )}

        {/* 统计条 */}
        <div className="flex items-center gap-6 flex-wrap mb-8 anim-fadeUp" style={{ animationDelay: "60ms" }}>
          <Stat label="藏书" value={`${app.books.length} 部`} icon="book" />
          <Stat label="批注" value={`${app.annotations.length} 条`} icon="note" />
          <Stat label="书签" value={`${app.bookmarks.length} 枚`} icon="bookmark" />
          <Stat label="占用" value={fmtSize(totalSize)} icon="box" />
          <div className="flex-1" />
          <button onClick={() => app.setView("convert")} className="group flex items-center gap-1.5 text-xs text-mist hover:text-verm transition-colors cursor-pointer">
            <Icon name="swap" size={13} /> 格式转换 <Icon name="arrowR" size={12} className="transition-transform group-hover:translate-x-0.5" />
          </button>
          <button onClick={() => app.setView("export")} className="group flex items-center gap-1.5 text-xs text-mist hover:text-verm transition-colors cursor-pointer">
            <Icon name="zip" size={13} /> 打包导出 <Icon name="arrowR" size={12} className="transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>

        {/* 继续阅读 */}
        {continueBook && !q && (
          <section className="mb-10 anim-fadeUp" style={{ animationDelay: "100ms" }}>
            <div className="relative overflow-hidden rounded-xl bg-pine text-paper p-6 flex items-center gap-6 cover-shadow">
              <div className="absolute -right-10 -top-16 w-56 h-56 rounded-full bg-gold/12 blur-2xl" />
              <div className="absolute right-24 -bottom-20 w-40 h-40 rounded-full bg-verm/15 blur-2xl" />
              {continueBook.cover && (
                <img src={continueBook.cover} alt="" className="w-20 h-28 object-cover rounded-md cover-shadow shrink-0 relative -rotate-2" />
              )}
              <div className="min-w-0 flex-1 relative">
                <p className="text-[10px] tracking-[0.3em] text-gold font-bold uppercase mb-1.5">继续阅读</p>
                <h3 className="font-display font-black text-xl truncate">《{continueBook.title}》</h3>
                <p className="text-xs text-paper/55 mt-0.5">
                  {continueBook.author} · 已读至第 {(app.progress[continueBook.id]?.chapterIndex ?? 0) + 1} 章 ·{" "}
                  {Math.round((app.progress[continueBook.id]?.percent ?? 0) * 100)}%
                </p>
                <div className="flex items-center gap-3 mt-3.5">
                  <ProgressBar value={app.progress[continueBook.id]?.percent ?? 0} className="flex-1 max-w-[260px] bg-white/15" color="var(--color-gold)" />
                  <Btn variant="gold" size="sm" onClick={() => app.openBook(continueBook.id)}>
                    <Icon name="bookOpen" size={14} /> 翻开
                  </Btn>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 书籍网格 */}
        {app.books.length === 0 ? (
          <EmptyState icon="library" title="书架空空如也" desc="导入你的第一本书，或拖拽文件到此页面。首次启动会自动内置四本示例书，若未出现可尝试刷新。">
            <Btn onClick={() => fileRef.current?.click()}><Icon name="upload" size={15} /> 选择文件导入</Btn>
          </EmptyState>
        ) : books.length === 0 ? (
          <EmptyState icon="search" title="没有匹配的书" desc={`找不到与「${q}」相关的藏书。`}>
            <Btn variant="ghost" onClick={() => setQ("")}>清除搜索</Btn>
          </EmptyState>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-6 gap-y-9">
            {books.map((b, i) => {
              const prog = app.progress[b.id];
              const noteCount = app.annotations.filter((n) => n.bookId === b.id).length;
              return (
                <div key={b.id} className="group anim-fadeUp" style={{ animationDelay: `${Math.min(i, 12) * 45}ms` }}>
                  <button
                    onClick={() => app.openBook(b.id)}
                    className="block w-full text-left cursor-pointer"
                    title={`打开《${b.title}》`}
                  >
                    <div className="relative">
                      {b.cover ? (
                        <img src={b.cover} alt={b.title} className="w-full aspect-[5/7] object-cover rounded-md cover-shadow hover-lift" />
                      ) : (
                        <div
                          className="w-full aspect-[5/7] rounded-md cover-shadow hover-lift flex flex-col items-center justify-center gap-2 text-white/90"
                          style={{ background: `linear-gradient(160deg, ${FORMAT_COLOR[b.format]}, #14231c)` }}
                        >
                          <Icon name="book" size={30} strokeWidth={1.4} />
                          <span className="font-display font-bold text-sm px-3 text-center leading-snug">{b.title}</span>
                        </div>
                      )}
                      <span className="absolute top-2 left-2 text-[9px] font-black text-white px-1.5 py-0.5 rounded shadow" style={{ background: FORMAT_COLOR[b.format] }}>
                        {FORMAT_LABEL[b.format]}
                      </span>
                      {noteCount > 0 && (
                        <span className="absolute top-2 right-2 text-[9px] font-bold bg-pine/85 text-gold-soft px-1.5 py-0.5 rounded-full flex items-center gap-1">
                          <Icon name="note" size={9} /> {noteCount}
                        </span>
                      )}
                      {/* 悬浮操作 */}
                      <div className="absolute inset-x-2 bottom-2 flex gap-1.5 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200">
                        <button
                          onClick={(e) => { e.stopPropagation(); app.openBook(b.id); }}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md bg-verm text-white text-[11px] font-bold shadow-lg hover:bg-verm-deep transition-colors cursor-pointer"
                        >
                          <Icon name="bookOpen" size={12} /> 阅读
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); app.setExportPickId(b.id); app.setView("export"); }}
                          title="打包导出"
                          className="px-2.5 rounded-md bg-pine/90 text-gold-soft shadow-lg hover:bg-pine transition-colors cursor-pointer"
                        >
                          <Icon name="box" size={13} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmDel(b); }}
                          title="移出书架"
                          className="px-2.5 rounded-md bg-pine/90 text-paper/80 shadow-lg hover:text-verm hover:bg-pine transition-colors cursor-pointer"
                        >
                          <Icon name="trash" size={13} />
                        </button>
                      </div>
                    </div>
                    <div className="mt-2.5 px-0.5">
                      <p className="font-display font-bold text-[13.5px] leading-snug truncate group-hover:text-verm transition-colors">{b.title}</p>
                      <p className="text-[11px] text-mist truncate mt-0.5">{b.author} · {fmtSize(b.size)}</p>
                      {prog && (
                        <div className="mt-1.5">
                          <ProgressBar value={prog.percent} />
                        </div>
                      )}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <footer className="mt-14 pb-6 text-center text-[11px] text-mist/70 leading-relaxed">
          <p>所有书籍与笔记仅保存在本机浏览器（IndexedDB）中，不经过任何网络请求。</p>
          <p className="mt-1">墨阁 BookViewer Pro · 纯本地运行 · 请仅处理合法持有的文档</p>
        </footer>
      </div>

      {/* 删除确认 */}
      <Modal open={Boolean(confirmDel)} onClose={() => setConfirmDel(null)} title="移出书架" width={400}>
        {confirmDel && (
          <div>
            <p className="text-sm leading-relaxed text-ink-soft">
              确定将 <strong className="text-ink">《{confirmDel.title}》</strong> 移出书架吗？
              其 <strong className="text-verm">{app.annotations.filter((n) => n.bookId === confirmDel.id).length} 条笔记</strong> 与书签也会一并删除。
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <Btn variant="ghost" onClick={() => setConfirmDel(null)}>取消</Btn>
              <Btn variant="primary" onClick={() => { app.removeBook(confirmDel.id); setConfirmDel(null); }}>
                <Icon name="trash" size={14} /> 确认移出
              </Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: React.ComponentProps<typeof Icon>["name"] }) {
  return (
    <div className="flex items-center gap-2.5 bg-card border border-line rounded-lg pl-3 pr-4 py-2">
      <span className="w-7 h-7 rounded-md bg-pine text-gold-soft flex items-center justify-center"><Icon name={icon} size={14} /></span>
      <span>
        <span className="block text-sm font-black leading-tight tabular-nums">{value}</span>
        <span className="block text-[10px] text-mist leading-tight">{label}</span>
      </span>
    </div>
  );
}
