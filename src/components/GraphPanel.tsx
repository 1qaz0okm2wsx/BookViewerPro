/** 知识图谱（@antv/g6）与思维导图（markmap）：把书、章节、笔记、标签的关联可视化 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { saveAs } from "file-saver";
import { useApp } from "../store";
import { parseBook, stripHtml } from "../lib/parse";
import { loadBookStore, saveBookStore } from "../db/BookDB";
import { chat, loadLlmSettings } from "../ai/llm";
import { Icon } from "./icons";
import { Btn, Spinner, ViewHeader } from "./ui";

type Tab = "graph" | "mind";

interface NodeMeta {
  kind: "book" | "tag" | "chapter" | "note";
  bookId?: string;
  chapterId?: string;
  annotationId?: string;
  label: string;
}

interface GraphLike {
  render: () => Promise<void>;
  on: (event: string, cb: (evt: { target?: { id?: string } }) => void) => void;
  destroy: () => void;
}

const KIND_COLOR: Record<NodeMeta["kind"], string> = {
  book: "#c6431f",
  tag: "#c89b3c",
  chapter: "#3f6b52",
  note: "#4a7a9b",
};

function GraphTab() {
  const app = useApp();
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState("");
  const metaRef = useRef<Map<string, NodeMeta>>(new Map());

  const { nodes, edges } = useMemo(() => {
    const ns: Array<{ id: string; data: { label: string; color: string; size: number; kind: NodeMeta["kind"] } }> = [];
    const es: Array<{ source: string; target: string }> = [];
    const meta = new Map<string, NodeMeta>();
    const books = app.books.slice(0, 12);
    books.forEach((b) => {
      const bid = `b:${b.id}`;
      ns.push({ id: bid, data: { label: b.title.slice(0, 8), color: KIND_COLOR.book, size: 30, kind: "book" } });
      meta.set(bid, { kind: "book", bookId: b.id, label: b.title });
      (b.tags ?? []).forEach((t) => {
        const tid = `t:${t}`;
        if (!meta.has(tid)) {
          ns.push({ id: tid, data: { label: `#${t}`, color: KIND_COLOR.tag, size: 20, kind: "tag" } });
          meta.set(tid, { kind: "tag", label: t });
        }
        es.push({ source: bid, target: tid });
      });
    });
    app.annotations.slice(0, 60).forEach((n) => {
      const nid = `n:${n.id}`;
      const bid = `b:${n.bookId}`;
      if (!meta.has(bid)) return;
      const cid = `c:${n.bookId}:${n.chapterId}`;
      if (!meta.has(cid)) {
        ns.push({ id: cid, data: { label: n.chapterTitle.slice(0, 7), color: KIND_COLOR.chapter, size: 16, kind: "chapter" } });
        meta.set(cid, { kind: "chapter", bookId: n.bookId, chapterId: n.chapterId, label: n.chapterTitle });
        es.push({ source: bid, target: cid });
      }
      ns.push({ id: nid, data: { label: n.text.slice(0, 6) + "…", color: KIND_COLOR.note, size: 10, kind: "note" } });
      meta.set(nid, { kind: "note", bookId: n.bookId, chapterId: n.chapterId, annotationId: n.id, label: n.text });
      es.push({ source: cid, target: nid });
    });
    metaRef.current = meta;
    return { nodes: ns, edges: es };
  }, [app.books, app.annotations]);

  useEffect(() => {
    let graph: GraphLike | null = null;
    let cancelled = false;
    setReady(false);
    setFailed("");
    (async () => {
      try {
        const G6 = await import("@antv/g6");
        if (cancelled || !containerRef.current || !nodes.length) return;
        containerRef.current.innerHTML = "";
        const g = new G6.Graph({
          container: containerRef.current,
          autoFit: "view",
          padding: 24,
          data: { nodes, edges },
          layout: { type: "force", preventOverlap: true, linkDistance: 86, collideStrength: 0.8 },
          node: {
            style: (d: { data?: { color?: string; size?: number; label?: string } }) => ({
              size: d.data?.size ?? 16,
              fill: d.data?.color ?? "#999",
              stroke: "#ffffff",
              lineWidth: 1.5,
              labelText: d.data?.label ?? "",
              labelFontSize: 10,
              labelFill: "#4b5551",
              labelPlacement: "bottom",
              labelBackground: true,
              labelBackgroundFill: "rgba(255,255,255,0.82)",
              labelBackgroundRadius: 3,
              cursor: "pointer",
            }),
          },
          edge: { style: { stroke: "#cbc4b2", lineWidth: 1 } },
          behaviors: ["drag-canvas", "zoom-canvas", "drag-element"],
          animation: true,
        }) as unknown as GraphLike;
        graph = g;
        await graph.render();
        graph.on("node:click", (evt: { target?: { id?: string } }) => {
          const m = metaRef.current.get(evt.target?.id ?? "");
          if (!m) return;
          if (m.kind === "book" && m.bookId) app.openBook(m.bookId);
          else if ((m.kind === "chapter" || m.kind === "note") && m.bookId) {
            app.setPendingJump({ bookId: m.bookId, chapterId: m.chapterId, annotationId: m.annotationId });
            app.openBook(m.bookId);
          } else if (m.kind === "tag") {
            app.toast(`标签「${m.label}」：${app.books.filter((b) => b.tags?.includes(m.label)).length} 本书`, "info");
          }
        });
        setReady(true);
      } catch (e) {
        if (!cancelled) setFailed(e instanceof Error ? e.message : "图谱渲染失败");
      }
    })();
    return () => {
      cancelled = true;
      try { graph?.destroy(); } catch { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  if (!app.books.length) {
    return <p className="text-sm text-mist py-16 text-center">书架为空——导入几本书、做些批注后，这里会长出一张知识网络。</p>;
  }

  return (
    <div className="bg-card border border-line rounded-xl overflow-hidden">
      <div className="flex items-center gap-4 px-4 py-2.5 border-b border-line bg-paper/70 text-[11px] text-mist flex-wrap">
        {(Object.keys(KIND_COLOR) as Array<NodeMeta["kind"]>).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: KIND_COLOR[k] }} />
            {{ book: "书籍", tag: "标签", chapter: "章节", note: "批注" }[k]}
          </span>
        ))}
        <span className="ml-auto">拖拽画布 · 滚轮缩放 · 点击节点跳转原文</span>
      </div>
      <div ref={containerRef} className="h-[58vh] w-full" />
      {!ready && !failed && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="flex items-center gap-2 text-xs text-mist bg-card/90 border border-line rounded-full px-4 py-2"><Spinner size={14} className="text-verm" /> 正在渲染图谱…</span>
        </div>
      )}
      {failed && <p className="text-xs text-verm px-4 py-3">{failed}</p>}
    </div>
  );
}

/** 从已解析的章节构建层级大纲（章节 + 子标题 + 代表性段落） */
function buildOutlineFromParsed(title: string, chapters: Array<{ title: string; html: string }>): string {
  const lines: string[] = [`# ${title}`];
  chapters.forEach((ch) => {
    lines.push(`## ${ch.title}`);
    const doc = new DOMParser().parseFromString(ch.html, "text/html");
    const subs = Array.from(doc.querySelectorAll("h3,h4")).slice(0, 12);
    if (subs.length) {
      subs.forEach((s) => {
        const t = (s.textContent ?? "").trim();
        if (t) lines.push(`### ${t}`);
      });
    } else {
      Array.from(doc.querySelectorAll("p")).slice(0, 4).forEach((p) => {
        const t = (p.textContent ?? "").trim();
        if (t) lines.push(`- ${t.slice(0, 30)}${t.length > 30 ? "…" : ""}`);
      });
    }
  });
  return lines.join("\n");
}

function MindTab() {
  const app = useApp();
  const textBooks = app.books;
  const [bookId, setBookId] = useState("");
  const svgRef = useRef<SVGSVGElement>(null);
  const mmRef = useRef<{ destroy: () => void } | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [failed, setFailed] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [source, setSource] = useState<"db" | "content" | "ai" | "">("");

  const book = textBooks.find((b) => b.id === bookId) ?? null;

  /* 选择书后：优先从该书数据库 mindmap 表读取，否则从内容提取并落库 */
  useEffect(() => {
    let cancelled = false;
    setMarkdown("");
    setSource("");
    if (!bookId || !book) return;
    (async () => {
      const stored = await loadBookStore<string>(bookId, "mindmap");
      if (stored && !cancelled) {
        setMarkdown(stored);
        setSource("db");
        return;
      }
      const blob = await app.getBlob(bookId);
      if (!blob || cancelled) return;
      try {
        const parsed = await parseBook(book, blob);
        const md = buildOutlineFromParsed(parsed.title || book.title, parsed.chapters);
        if (cancelled) return;
        setMarkdown(md);
        setSource("content");
        await saveBookStore(bookId, "mindmap", md);
      } catch (e) {
        if (!cancelled) setFailed(e instanceof Error ? e.message : "大纲提取失败");
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  /* AI 重生成全书大纲（调用 LLM 归纳层级，覆盖并落库） */
  const regenAI = async () => {
    if (!book || aiBusy) return;
    setAiBusy(true);
    setFailed("");
    try {
      const blob = await app.getBlob(book.id);
      if (!blob) throw new Error("读取书籍失败");
      const parsed = await parseBook(book, blob);
      const sample = parsed.chapters.slice(0, 30)
        .map((c) => `${c.title}：${stripHtml(c.html).replace(/\s+/g, " ").slice(0, 180)}`)
        .join("\n");
      const md = await chat(loadLlmSettings(), [
        { role: "system", content: "你是文档分析专家。根据用户给出的书籍章节与内容摘要，提取主要章节和子主题，生成一个层级大纲（Markdown：# 书名，## 章，###/#### 子主题），最多 4 级，只输出 Markdown，不要解释。" },
        { role: "user", content: `书名：${parsed.title}\n\n${sample}` },
      ]);
      const clean = md.replace(/^```[a-z]*\n?/i, "").replace(/```$/g, "").trim();
      if (!clean) throw new Error("AI 未返回有效大纲");
      setMarkdown(clean);
      setSource("ai");
      await saveBookStore(book.id, "mindmap", clean);
      app.toast("AI 大纲已生成并存入该书数据库");
    } catch (e) {
      setFailed(e instanceof Error ? e.message : "AI 生成失败（请检查模型接入）");
    } finally {
      setAiBusy(false);
    }
  };

  useEffect(() => {
    if (!markdown || !svgRef.current) return;
    let cancelled = false;
    setBusy(true);
    setFailed("");
    (async () => {
      try {
        const { Transformer } = await import("markmap-lib");
        const { Markmap } = await import("markmap-view");
        if (cancelled || !svgRef.current) return;
        const { root } = new Transformer().transform(markdown);
        mmRef.current?.destroy();
        mmRef.current = Markmap.create(svgRef.current, { autoFit: true, duration: 280, maxWidth: 260 }, root);
      } catch (e) {
        if (!cancelled) setFailed(e instanceof Error ? e.message : "思维导图渲染失败");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [markdown]);

  useEffect(() => () => { try { mmRef.current?.destroy(); } catch { /* ignore */ } }, []);

  const exportMd = () => saveAs(new Blob([markdown], { type: "text/markdown;charset=utf-8" }), `${book?.title ?? "思维导图"}.md`);
  const exportSvg = () => {
    if (!svgRef.current) return;
    const src = new XMLSerializer().serializeToString(svgRef.current);
    saveAs(new Blob([src], { type: "image/svg+xml;charset=utf-8" }), `${book?.title ?? "思维导图"}.svg`);
  };

  return (
    <div className="bg-card border border-line rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-line bg-paper/70 flex-wrap">
        <select value={bookId} onChange={(e) => setBookId(e.target.value)} className="bg-card border border-line rounded-md px-2.5 py-1.5 text-xs outline-none focus:border-verm cursor-pointer">
          <option value="">选择一本书…</option>
          {textBooks.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
        </select>
        <span className="text-[11px] text-mist">
          {source === "db" ? "已从该书数据库载入大纲" : source === "content" ? "已自动从全书内容提取纲要并落库" : source === "ai" ? "AI 生成的大纲（已存入数据库）" : "从全书章节结构自动提取内容纲要"}
        </span>
        <span className="ml-auto flex gap-1.5">
          <Btn size="sm" variant="ghost" onClick={regenAI} disabled={!book || aiBusy}>
            {aiBusy ? <Spinner size={12} /> : <Icon name="spark" size={12} />} AI 重生成
          </Btn>
          <Btn size="sm" variant="ghost" onClick={exportMd} disabled={!book || !markdown}><Icon name="download" size={12} /> Markdown</Btn>
          <Btn size="sm" variant="ghost" onClick={exportSvg} disabled={!book || !markdown}><Icon name="image" size={12} /> SVG 图片</Btn>
        </span>
      </div>
      <div className="relative h-[58vh]">
        {busy && <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none"><span className="flex items-center gap-2 text-xs text-mist bg-card/90 border border-line rounded-full px-4 py-2"><Spinner size={14} className="text-verm" /> 渲染中…</span></div>}
        {!book ? (
          <div className="h-full flex flex-col items-center justify-center text-mist">
            <Icon name="map" size={40} strokeWidth={1.2} className="mb-4 opacity-40" />
            <p className="text-sm">选择一本书，把它的章节与批注展开成思维导图</p>
          </div>
        ) : (
          <svg ref={svgRef} className="w-full h-full" />
        )}
        {failed && <p className="absolute bottom-3 left-4 text-xs text-verm">{failed}</p>}
      </div>
    </div>
  );
}

export default function GraphPanel() {
  const app = useApp();
  const [tab, setTab] = useState<Tab>("graph");
  return (
    <div className="h-full overflow-y-auto app-bg">
      <div className="max-w-6xl mx-auto px-8 py-10">
        <ViewHeader
          kicker="Atlas · 图谱"
          title="知识图谱"
          desc="书籍、章节、批注与标签之间的隐性脉络，以交互式节点图呈现；思维导图则把一本书的骨架与你的批注折叠成树。"
        />
        <div className="flex items-center gap-2 mb-6">
          {([
            { key: "graph" as Tab, label: "关联图谱", icon: "network" as const },
            { key: "mind" as Tab, label: "思维导图", icon: "map" as const },
          ]).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-bold transition-all cursor-pointer ${tab === t.key ? "bg-pine text-paper border-pine shadow-lg" : "border-line bg-card text-ink-soft hover:border-ink/35"}`}
            >
              <Icon name={t.icon} size={15} className={tab === t.key ? "text-gold" : ""} /> {t.label}
            </button>
          ))}
          <button onClick={() => app.setView("notes")} className="ml-auto text-[11px] text-mist hover:text-verm transition-colors cursor-pointer flex items-center gap-1">
            <Icon name="note" size={12} /> 去笔记中心
          </button>
        </div>
        <div key={tab} className="anim-fadeIn relative">
          {tab === "graph" ? <GraphTab /> : <MindTab />}
        </div>
      </div>
    </div>
  );
}
