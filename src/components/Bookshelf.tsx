import React, { useMemo, useRef, useState } from "react";
import { useApp } from "../store";
import { Icon } from "./icons";
import { Btn, EmptyState, Modal, ProgressBar } from "./ui";
import { fmtSize, FORMAT_LABEL, FORMAT_COLOR } from "../types";
import type { BookFormat, BookMeta } from "../types";

type SortKey = "recent" | "title" | "author" | "rating";

export default function Bookshelf() {
  const app = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [q, setQ] = useState("");
  const [format, setFormat] = useState<"all" | BookFormat>("all");
  const [tag, setTag] = useState("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [editing, setEditing] = useState<BookMeta | null>(null);
  const [draft, setDraft] = useState({ title: "", author: "", tags: "", review: "", rating: 0 });
  const [batch, setBatch] = useState<{ done: number; total: number; name: string } | null>(null);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    app.books.forEach((b) => b.tags?.forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [app.books]);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    const list = app.books
      .filter((b) => format === "all" || b.format === format)
      .filter((b) => tag === "all" || b.tags?.includes(tag))
      .filter((b) =>
        !kw ||
        b.title.toLowerCase().includes(kw) ||
        b.author.toLowerCase().includes(kw) ||
        (b.tags ?? []).some((t) => t.toLowerCase().includes(kw)) ||
        (b.review ?? "").toLowerCase().includes(kw),
      );
    list.sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title, "zh");
      if (sort === "author") return a.author.localeCompare(b.author, "zh");
      if (sort === "rating") return (b.rating ?? 0) - (a.rating ?? 0) || b.addedAt - a.addedAt;
      return b.addedAt - a.addedAt;
    });
    return list;
  }, [app.books, q, format, tag, sort]);

  const continueBook = useMemo(() => {
    const entries = Object.entries(app.progress)
      .map(([id, p]) => ({ id, p }))
      .filter((x) => app.books.some((b) => b.id === x.id))
      .sort((a, b) => b.p.updatedAt - a.p.updatedAt);
    return entries.length ? app.books.find((b) => b.id === entries[0].id)! : null;
  }, [app.progress, app.books]);

  const onFolder = async (files: FileList) => {
    setBatch({ done: 0, total: files.length, name: "" });
    const n = await app.importBatch(files, (done, total, name) => setBatch({ done, total, name }));
    setBatch(null);
    if (n > 0) app.toast(`文件夹扫描完成，成功导入 ${n} 本`);
  };

  const openEdit = (b: BookMeta) => {
    setEditing(b);
    setDraft({ title: b.title, author: b.author, tags: (b.tags ?? []).join(", "), review: b.review ?? "", rating: b.rating ?? 0 });
  };

  const saveEdit = () => {
    if (!editing) return;
    app.updateBookMeta(editing.id, {
      title: draft.title.trim() || editing.title,
      author: draft.author.trim() || "—",
      tags: draft.tags.split(/[,，\s]+/).map((t) => t.trim()).filter(Boolean).slice(0, 12),
      review: draft.review.trim(),
      rating: draft.rating,
    });
    setEditing(null);
    app.toast("书目信息已更新");
  };

  return (
    <div
      className="h-full overflow-y-auto app-bg relative"
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDrag(false); }}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (e.dataTransfer.files.length) app.addFiles(e.dataTransfer.files);
      }}
    >
      {/* 拖放遮罩 */}
      {drag && (
        <div className="fixed inset-0 z-50 bg-pine/70 backdrop-blur-sm flex items-center justify-center anim-fadeIn pointer-events-none">
          <div className="border-2 border-dashed border-gold rounded-2xl px-14 py-12 text-center">
            <Icon name="upload" size={40} className="text-gold mx-auto mb-4" />
            <p className="font-display font-black text-2xl text-paper">松开以导入书籍</p>
            <p className="text-xs text-paper/60 mt-2">支持 EPUB / PDF / DOCX / MOBI / FB2 / CBZ / MD / TXT / HTML / SVG / 图片</p>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-8 py-10">
        {/* 报头 */}
        <div className="flex items-end justify-between gap-4 flex-wrap mb-8">
          <div>
            <p className="text-[11px] font-bold tracking-[0.28em] text-verm uppercase mb-2">Library · 书库</p>
            <h1 className="font-display font-black text-[38px] leading-tight text-ink">我的书架</h1>
            <p className="text-sm text-mist mt-2 leading-relaxed">
              藏书 <strong className="text-ink tabular-nums">{app.books.length}</strong> 本 · 批注 <strong className="text-ink tabular-nums">{app.annotations.length}</strong> 条 · 书签 <strong className="text-ink tabular-nums">{app.bookmarks.length}</strong> 枚
              {app.stats[todayKeyStr()]?.seconds ? ` · 今日已读 ${Math.round(app.stats[todayKeyStr()].seconds / 60)} 分钟` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <Btn variant="ghost" onClick={() => dirRef.current?.click()}><Icon name="folder" size={15} /> 扫描文件夹</Btn>
            <Btn onClick={() => fileRef.current?.click()}><Icon name="upload" size={15} /> 导入书籍</Btn>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) app.addFiles(e.target.files); e.target.value = ""; }} />
            <input ref={dirRef} type="file" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) onFolder(e.target.files); e.target.value = ""; }} />
          </div>
        </div>

        {/* 批量导入进度 */}
        {batch && (
          <div className="mb-6 bg-card border border-line rounded-lg px-4 py-3 anim-fadeUp">
            <p className="text-xs text-ink-soft mb-2 flex items-center gap-2">
              <Icon name="folder" size={13} className="text-moss" />
              正在扫描导入 <strong>{batch.name || "…"}</strong>（{batch.done}/{batch.total}）
            </p>
            <ProgressBar value={batch.total ? batch.done / batch.total : 0} className="stripe-live" color="var(--color-moss)" />
          </div>
        )}

        {/* 继续阅读 */}
        {continueBook && !q && format === "all" && tag === "all" && (
          <button
            onClick={() => app.openBook(continueBook.id)}
            className="w-full mb-8 text-left bg-pine text-paper rounded-xl p-4 flex items-center gap-4 hover-lift anim-fadeUp cursor-pointer group"
          >
            {continueBook.cover && <img src={continueBook.cover} alt="" className="w-12 h-16 rounded-md object-cover cover-shadow shrink-0" />}
            <div className="min-w-0 flex-1">
              <p className="text-[10px] tracking-[0.24em] text-gold font-bold uppercase mb-1">继续阅读</p>
              <p className="font-display font-bold text-lg truncate">《{continueBook.title}》</p>
              <div className="flex items-center gap-3 mt-2">
                <ProgressBar value={app.progress[continueBook.id]?.percent ?? 0} className="flex-1 bg-white/12!" color="var(--color-gold)" />
                <span className="text-[11px] text-paper/60 tabular-nums shrink-0">{Math.round((app.progress[continueBook.id]?.percent ?? 0) * 100)}%</span>
              </div>
            </div>
            <Icon name="chevR" size={20} className="text-gold shrink-0 transition-transform group-hover:translate-x-1" />
          </button>
        )}

        {/* 检索条 */}
        <div className="flex items-center gap-2.5 flex-wrap mb-6">
          <div className="flex items-center gap-2 bg-card border border-line rounded-lg px-3 py-2 flex-1 min-w-[220px] focus-within:border-verm transition-colors">
            <Icon name="search" size={14} className="text-mist" />
            <input
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="全局搜索：书名 / 作者 / 标签 / 短评…"
              className="bg-transparent outline-none text-xs flex-1"
            />
            {q && <button onClick={() => setQ("")} className="text-mist hover:text-ink cursor-pointer"><Icon name="x" size={13} /></button>}
          </div>
          <select value={format} onChange={(e) => setFormat(e.target.value as typeof format)} className="bg-card border border-line rounded-lg px-2.5 py-2 text-xs outline-none focus:border-verm cursor-pointer">
            <option value="all">全部格式</option>
            {Object.keys(FORMAT_LABEL).map((f) => (
              app.books.some((b) => b.format === f) ? <option key={f} value={f}>{FORMAT_LABEL[f as BookFormat]}</option> : null
            ))}
          </select>
          <select value={tag} onChange={(e) => setTag(e.target.value)} className="bg-card border border-line rounded-lg px-2.5 py-2 text-xs outline-none focus:border-verm cursor-pointer">
            <option value="all">全部标签</option>
            {allTags.map((t) => <option key={t} value={t}>#{t}</option>)}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="bg-card border border-line rounded-lg px-2.5 py-2 text-xs outline-none focus:border-verm cursor-pointer">
            <option value="recent">最近加入</option>
            <option value="title">书名</option>
            <option value="author">作者</option>
            <option value="rating">评分</option>
          </select>
          <span className="text-[11px] text-mist tabular-nums">{filtered.length} / {app.books.length} 本</span>
        </div>

        {/* 书架 */}
        {app.books.length === 0 ? (
          <EmptyState icon="library" title="书架空空如也" desc="点击「导入书籍」选择文件，或「扫描文件夹」批量导入整个目录；也可以直接把文件拖进这个窗口。">
            <div className="flex gap-2">
              <Btn onClick={() => fileRef.current?.click()}><Icon name="upload" size={15} /> 导入书籍</Btn>
              <Btn variant="ghost" onClick={() => dirRef.current?.click()}><Icon name="folder" size={15} /> 扫描文件夹</Btn>
            </div>
          </EmptyState>
        ) : filtered.length === 0 ? (
          <EmptyState icon="search" title="没有匹配的书" desc="调整搜索关键词或筛选条件试试。">
            <Btn variant="ghost" onClick={() => { setQ(""); setFormat("all"); setTag("all"); }}>清除筛选</Btn>
          </EmptyState>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-5 gap-y-8">
            {filtered.map((b, i) => {
              const prog = app.progress[b.id]?.percent ?? 0;
              const noteCount = app.annotations.filter((n) => n.bookId === b.id).length;
              return (
                <div key={b.id} className="group anim-fadeUp" style={{ animationDelay: `${Math.min(i, 14) * 35}ms` }}>
                  <div className="relative cursor-pointer" onClick={() => app.openBook(b.id)}>
                    {b.cover ? (
                      <img src={b.cover} alt={b.title} className="w-full aspect-[5/7] object-cover rounded-md cover-shadow hover-lift" draggable={false} />
                    ) : (
                      <div className="w-full aspect-[5/7] rounded-md cover-shadow hover-lift bg-pine-2 flex flex-col items-center justify-center gap-2 p-3">
                        <Icon name="book" size={22} className="text-gold-soft" />
                        <p className="font-display font-bold text-paper text-sm text-center leading-snug">{b.title.slice(0, 10)}</p>
                      </div>
                    )}
                    <span className="absolute top-2 left-2 text-[9px] font-black text-white px-1.5 py-0.5 rounded shadow" style={{ background: FORMAT_COLOR[b.format] }}>
                      {FORMAT_LABEL[b.format]}
                    </span>
                    {(b.rating ?? 0) > 0 && (
                      <span className="absolute top-2 right-2 flex items-center gap-0.5 text-[10px] font-black bg-pine/85 text-gold px-1.5 py-0.5 rounded">
                        <Icon name="star" size={9} className="fill-current" /> {b.rating}
                      </span>
                    )}
                    {prog > 0 && (
                      <div className="absolute bottom-0 inset-x-0 h-[5px] bg-black/30 rounded-b-md overflow-hidden">
                        <div className="h-full bg-gold transition-[width] duration-700" style={{ width: `${Math.round(prog * 100)}%` }} />
                      </div>
                    )}
                    {/* 悬停操作条 */}
                    <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-200" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => openEdit(b)} title="标签 / 评分 / 短评" className="w-8 h-8 rounded-md bg-pine/92 text-paper flex items-center justify-center hover:bg-pine cursor-pointer shadow-lg backdrop-blur-sm"><Icon name="pen" size={13} /></button>
                      <button onClick={() => { app.setExportPickId(b.id); app.setView("export"); }} title="打包导出" className="w-8 h-8 rounded-md bg-pine/92 text-paper flex items-center justify-center hover:bg-pine cursor-pointer shadow-lg backdrop-blur-sm"><Icon name="zip" size={13} /></button>
                      <button
                        onClick={() => { if (window.confirm(`确定移除《${b.title}》及其全部批注、书签与进度吗？`)) app.removeBook(b.id); }}
                        title="移除"
                        className="w-8 h-8 rounded-md bg-verm/92 text-white flex items-center justify-center hover:bg-verm-deep cursor-pointer shadow-lg backdrop-blur-sm"
                      ><Icon name="trash" size={13} /></button>
                    </div>
                  </div>
                  <div className="mt-2.5 px-0.5">
                    <p className="text-[13px] font-bold leading-snug truncate" title={b.title}>{b.title}</p>
                    <p className="text-[11px] text-mist truncate">{b.author} · {fmtSize(b.size)}</p>
                    {((b.tags?.length ?? 0) > 0 || noteCount > 0) && (
                      <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                        {(b.tags ?? []).slice(0, 3).map((t) => (
                          <button key={t} onClick={() => setTag(t)} className="text-[9px] px-1.5 py-0.5 rounded-full bg-gold/15 text-[#8a6d2b] hover:bg-gold/30 transition-colors cursor-pointer">#{t}</button>
                        ))}
                        {noteCount > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-moss/12 text-moss">{noteCount} 批注</span>}
                      </div>
                    )}
                    {b.review && <p className="text-[10px] text-mist/80 mt-1 line-clamp-1 italic" title={b.review}>“{b.review}”</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-center text-[11px] text-mist/70 mt-12 pb-4">
          所有文件仅保存在本机浏览器（IndexedDB）中 · 换设备前请先在「导出」页打包
        </p>
      </div>

      {/* 编辑书目信息 */}
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={`编辑 · ${editing?.title ?? ""}`} width={500}>
        {editing && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[10px] font-bold tracking-[0.2em] text-mist uppercase block mb-1.5">书名</span>
                <input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} className="w-full bg-paper border border-line rounded-md px-3 py-2 text-sm outline-none focus:border-verm transition-colors" />
              </label>
              <label className="block">
                <span className="text-[10px] font-bold tracking-[0.2em] text-mist uppercase block mb-1.5">作者</span>
                <input value={draft.author} onChange={(e) => setDraft((d) => ({ ...d, author: e.target.value }))} className="w-full bg-paper border border-line rounded-md px-3 py-2 text-sm outline-none focus:border-verm transition-colors" />
              </label>
            </div>
            <div>
              <span className="text-[10px] font-bold tracking-[0.2em] text-mist uppercase block mb-1.5">评分</span>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} onClick={() => setDraft((d) => ({ ...d, rating: d.rating === n ? 0 : n }))} className="p-0.5 cursor-pointer transition-transform hover:scale-110" title={`${n} 星`}>
                    <Icon name="star" size={22} className={n <= draft.rating ? "text-gold fill-current" : "text-line"} strokeWidth={1.6} />
                  </button>
                ))}
                <span className="text-xs text-mist ml-2">{draft.rating ? `${draft.rating} 星` : "未评分"}</span>
              </div>
            </div>
            <label className="block">
              <span className="text-[10px] font-bold tracking-[0.2em] text-mist uppercase block mb-1.5">标签（逗号或空格分隔）</span>
              <input value={draft.tags} onChange={(e) => setDraft((d) => ({ ...d, tags: e.target.value }))} placeholder="如：国学, 诗词, 枕边书" className="w-full bg-paper border border-line rounded-md px-3 py-2 text-sm outline-none focus:border-verm transition-colors" />
              {allTags.length > 0 && (
                <span className="flex gap-1 mt-1.5 flex-wrap">
                  {allTags.slice(0, 8).map((t) => (
                    <button key={t} onClick={() => setDraft((d) => ({ ...d, tags: d.tags ? `${d.tags}, ${t}` : t }))} className="text-[10px] px-1.5 py-0.5 rounded-full bg-line/60 hover:bg-gold/25 transition-colors cursor-pointer">#{t}</button>
                  ))}
                </span>
              )}
            </label>
            <label className="block">
              <span className="text-[10px] font-bold tracking-[0.2em] text-mist uppercase block mb-1.5">短评</span>
              <textarea value={draft.review} onChange={(e) => setDraft((d) => ({ ...d, review: e.target.value }))} rows={3} placeholder="一句话说说这本书…" className="w-full bg-paper border border-line rounded-md px-3 py-2 text-sm outline-none focus:border-verm resize-none transition-colors" />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <Btn variant="ghost" onClick={() => setEditing(null)}>取消</Btn>
              <Btn onClick={saveEdit}><Icon name="check" size={15} /> 保存</Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function todayKeyStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
