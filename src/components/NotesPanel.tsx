import React, { useMemo, useState } from "react";
import { saveAs } from "file-saver";
import { useApp } from "../store";
import { notesToOpml, notesToMindmapHtml } from "../lib/mindmap";
import { Icon } from "./icons";
import { Btn, EmptyState, Modal, ViewHeader } from "./ui";
import type { Annotation, NoteType } from "../types";

const TYPE_LABEL: Record<NoteType, string> = {
  highlight: "高亮", underline: "下划线", strike: "删除线", comment: "批注",
};

type Filter = "all" | NoteType | "bookmark";

export default function NotesPanel() {
  const app = useApp();
  const [filter, setFilter] = useState<Filter>("all");
  const [bookId, setBookId] = useState<string>("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Annotation | null>(null);
  const [draft, setDraft] = useState("");

  const bookName = (id: string) => app.books.find((b) => b.id === id)?.title ?? "已移除的书";

  const notes = useMemo(() => {
    return app.annotations
      .filter((n) => bookId === "all" || n.bookId === bookId)
      .filter((n) => filter === "all" || filter === "bookmark" || n.type === filter)
      .filter((n) => !q.trim() || n.text.includes(q.trim()) || n.note.includes(q.trim()) || n.chapterTitle.includes(q.trim()))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [app.annotations, filter, bookId, q]);

  const marks = useMemo(() => {
    return app.bookmarks
      .filter((b) => bookId === "all" || b.bookId === bookId)
      .filter((b) => !q.trim() || b.label.includes(q.trim()))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [app.bookmarks, bookId, q]);

  const jumpTo = (n: Annotation) => {
    app.setPendingJump({ bookId: n.bookId, chapterId: n.chapterId, annotationId: n.id });
    app.openBook(n.bookId);
  };

  const filters: Array<{ key: Filter; label: string }> = [
    { key: "all", label: "全部" },
    { key: "highlight", label: "高亮" },
    { key: "underline", label: "下划线" },
    { key: "strike", label: "删除线" },
    { key: "comment", label: "批注" },
    { key: "bookmark", label: "书签" },
  ];

  return (
    <div className="h-full overflow-y-auto app-bg">
      <div className="max-w-5xl mx-auto px-8 py-10">
        <ViewHeader
          kicker="Annotations · 笔记"
          title="笔记与批注"
          desc="阅读时选中文字留下的每一条痕迹都汇总在这里，可筛选、检索、回跳原文，并随书籍一键导出。"
          right={
            app.annotations.length > 0 ? (
              <div className="flex gap-2">
                <Btn
                  variant="ghost" size="sm"
                  onClick={() => {
                    const book = bookId !== "all" ? app.books.find((b) => b.id === bookId) : undefined;
                    const list = bookId === "all" ? app.annotations : app.annotations.filter((n) => n.bookId === bookId);
                    saveAs(new Blob([notesToOpml(book?.title ?? "我的读书笔记", list)], { type: "text/x-opml;charset=utf-8" }), "读书笔记.opml");
                    app.toast("已导出 OPML（可导入幕布 / XMind / Logseq）");
                  }}
                ><Icon name="download" size={13} /> OPML</Btn>
                <Btn
                  variant="ghost" size="sm"
                  onClick={() => {
                    const book = bookId !== "all" ? app.books.find((b) => b.id === bookId) : undefined;
                    const list = bookId === "all" ? app.annotations : app.annotations.filter((n) => n.bookId === bookId);
                    saveAs(new Blob([notesToMindmapHtml(book?.title ?? "我的读书笔记", list)], { type: "text/html;charset=utf-8" }), "读书笔记_思维导图.html");
                    app.toast("已导出离线思维导图 HTML");
                  }}
                ><Icon name="map" size={13} /> 思维导图</Btn>
              </div>
            ) : undefined
          }
        />

        <div className="flex items-center gap-3 flex-wrap mb-7 anim-fadeUp">
          <div className="flex items-center bg-card border border-line rounded-lg p-1 gap-0.5">
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  filter === f.key ? "bg-pine text-paper shadow" : "text-ink-soft hover:bg-line/60"
                }`}
              >
                {f.label}
                <span className="ml-1 opacity-60 tabular-nums">
                  {f.key === "all" ? app.annotations.length : f.key === "bookmark" ? app.bookmarks.length : app.annotations.filter((n) => n.type === f.key).length}
                </span>
              </button>
            ))}
          </div>
          <select
            value={bookId} onChange={(e) => setBookId(e.target.value)}
            className="bg-card border border-line rounded-lg px-3 py-2 text-xs outline-none focus:border-verm cursor-pointer transition-colors"
          >
            <option value="all">全部书籍</option>
            {app.books.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
          </select>
          <div className="flex items-center gap-2 bg-card border border-line rounded-lg px-3 py-2 flex-1 min-w-[200px] focus-within:border-verm transition-colors">
            <Icon name="search" size={14} className="text-mist" />
            <input
              value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索笔记内容、原文或章节…"
              className="bg-transparent outline-none text-xs flex-1"
            />
            {q && <button onClick={() => setQ("")} className="text-mist hover:text-ink cursor-pointer"><Icon name="x" size={13} /></button>}
          </div>
        </div>

        {filter === "bookmark" ? (
          marks.length === 0 ? (
            <EmptyState icon="bookmark" title="没有书签" desc="在阅读页点击工具栏的书签图标即可收藏当前位置。" />
          ) : (
            <ul className="grid sm:grid-cols-2 gap-3">
              {marks.map((b, i) => (
                <li key={b.id} className="group bg-card border border-line rounded-lg p-4 hover:border-gold transition-colors anim-fadeUp flex items-start gap-3" style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}>
                  <span className="w-8 h-8 rounded-md bg-gold/15 text-gold flex items-center justify-center shrink-0"><Icon name="bookmark" size={15} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold truncate">{b.label || `第 ${b.chapterIndex + 1} 章`}</p>
                    <p className="text-[11px] text-mist mt-0.5">《{bookName(b.bookId)}》 · 第 {b.chapterIndex + 1} 章{b.page !== undefined ? ` 第 ${b.page + 1} 页` : ""} · {new Date(b.createdAt).toLocaleDateString("zh-CN")}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      className="p-1.5 rounded-md text-mist hover:text-verm hover:bg-verm/10 transition-colors cursor-pointer" title="回到此处"
                      onClick={() => {
                        app.setPendingJump({ bookId: b.bookId, chapterIndex: b.chapterIndex, percent: b.percent, page: b.page });
                        app.openBook(b.bookId);
                      }}
                    >
                      <Icon name="arrowR" size={14} />
                    </button>
                    <button onClick={() => app.removeBookmark(b.id)} className="p-1.5 rounded-md text-mist hover:text-verm hover:bg-verm/10 opacity-0 group-hover:opacity-100 transition-all cursor-pointer" title="删除">
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : notes.length === 0 ? (
          <EmptyState icon="note" title={q ? "没有匹配的笔记" : "还没有笔记"} desc={q ? "换个关键词试试。" : "打开一本书，选中任意一段文字，即可高亮、加线或写下批注。"}>
            {!q && app.books.length > 0 && (
              <Btn onClick={() => app.openBook(app.books[0].id)}><Icon name="bookOpen" size={15} /> 去读《{app.books[0].title}》</Btn>
            )}
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {notes.map((n, i) => (
              <li key={n.id} className="group bg-card border border-line rounded-lg p-4 hover:border-verm/40 hover:shadow-[0_8px_24px_-12px_rgba(20,35,28,0.25)] transition-all anim-fadeUp" style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-black px-2 py-0.5 rounded-full" style={{ background: `${n.color}44`, color: "#3d3a2c" }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: n.color }} />
                    {TYPE_LABEL[n.type]}
                  </span>
                  <span className="text-[11px] text-mist">《{bookName(n.bookId)}》 · {n.chapterTitle}</span>
                  <span className="text-[10px] text-mist/70 ml-auto tabular-nums">{new Date(n.updatedAt).toLocaleString("zh-CN", { hour12: false })}</span>
                </div>
                <p className="text-sm leading-relaxed text-ink border-l-[3px] pl-3" style={{ borderColor: n.color }}>「{n.text}」</p>
                {n.note && (
                  <p className="text-xs text-ink-soft mt-2.5 bg-paper border border-line rounded-md px-3 py-2 leading-relaxed">
                    <span className="text-verm font-bold mr-1">✎ 批注</span>{n.note}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Btn size="sm" variant="ghost" onClick={() => jumpTo(n)}><Icon name="arrowR" size={13} /> 回跳原文</Btn>
                  <Btn size="sm" variant="ghost" onClick={() => { setEditing(n); setDraft(n.note); }}><Icon name="pen" size={13} /> 编辑批注</Btn>
                  <button onClick={() => { app.removeAnnotation(n.id); app.toast("已删除", "info"); }} className="ml-auto p-1.5 rounded-md text-mist hover:text-verm hover:bg-verm/10 transition-colors cursor-pointer" title="删除">
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="编辑批注">
        {editing && (
          <div>
            <p className="text-xs text-mist mb-2">原文：「{editing.text}」</p>
            <textarea
              autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} rows={4}
              className="w-full bg-paper border border-line rounded-md px-3 py-2 text-sm outline-none focus:border-verm resize-none transition-colors"
            />
            <div className="flex justify-end gap-2 mt-4">
              <Btn variant="ghost" onClick={() => setEditing(null)}>取消</Btn>
              <Btn onClick={() => { app.updateAnnotation(editing.id, { note: draft.trim() }); setEditing(null); app.toast("批注已更新"); }}>
                <Icon name="check" size={15} /> 保存
              </Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
