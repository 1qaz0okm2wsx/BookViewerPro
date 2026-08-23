import React, { useEffect, useRef, useState } from "react";
import { saveAs } from "file-saver";
import { useApp } from "../store";
import { parseBook, stripHtml } from "../lib/parse";
import { buildEpub } from "../lib/epub";
import { htmlToDocxBlob } from "../lib/convert";
import { Icon } from "./icons";
import type { IconName } from "./icons";
import { Btn, Spinner, ViewHeader } from "./ui";
import SvgEditor from "./SvgEditor";

const WELCOME_DOC = `<h1>欢迎使用墨阁编辑器</h1>
<p>这是一份<strong>富文本编辑草稿</strong>。你可以从书库载入 EPUB / DOCX / Markdown / TXT / HTML / FB2 的正文继续编辑，也可以直接在这里开始写作。</p>
<h2>能做什么</h2>
<ul>
  <li>调整文字格式、插入链接、图片与表格；</li>
  <li>切换到「HTML 源码」页签直接改代码，右侧实时预览；</li>
  <li>在「SVG 画板」里绘制矢量插图；</li>
  <li>一键另存为 HTML / DOCX / EPUB，或存回书架继续阅读。</li>
</ul>
<blockquote>试着选中这段文字，用上方工具栏加粗或换个标题级别。</blockquote>
<p>—— 墨阁 BookViewer Pro</p>`;

type Tab = "rich" | "html" | "svg";

export default function Editor() {
  const app = useApp();
  const edRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const savedRange = useRef<Range | null>(null);

  const [tab, setTab] = useState<Tab>("rich");
  const [docHtml, setDocHtml] = useState(WELCOME_DOC);
  const [docTitle, setDocTitle] = useState("未命名文稿");
  const [svgInitial, setSvgInitial] = useState("");
  const [loading, setLoading] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("https://");
  const [saving, setSaving] = useState("");

  // 跳过一次 DOM 回写，避免输入时 innerHTML 重置导致光标跳动
  const skipWrite = useRef(false);
  const syncFromDom = () => {
    skipWrite.current = true;
    setDocHtml(edRef.current?.innerHTML ?? "");
  };
  useEffect(() => {
    const el = edRef.current;
    if (!el || tab !== "rich") return;
    if (skipWrite.current) {
      skipWrite.current = false;
      return;
    }
    el.innerHTML = docHtml;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docHtml, tab]);

  const exec = (cmd: string, val?: string) => {
    edRef.current?.focus();
    document.execCommand(cmd, false, val);
    syncFromDom();
  };

  const loadBook = async (id: string) => {
    const book = app.books.find((b) => b.id === id);
    if (!book) return;
    setLoading(true);
    try {
      const blob = await app.getBlob(id);
      if (!blob) throw new Error("找不到文件");
      if (book.format === "svg") {
        setSvgInitial(await blob.text());
        setDocTitle(book.title);
        setTab("svg");
        app.toast(`已载入《${book.title}》，可在画板上继续创作`);
        return;
      }
      if (!["epub", "docx", "txt", "md", "html", "fb2"].includes(book.format)) {
        app.toast(`${book.format.toUpperCase()} 不支持富文本编辑`, "error");
        return;
      }
      const parsed = await parseBook(book, blob);
      setDocHtml(parsed.chapters.map((c) => (parsed.chapters.length > 1 ? `<h1>${c.title}</h1>` : "") + c.html).join("\n"));
      setDocTitle(parsed.title);
      setTab("rich");
      app.toast(`已载入《${parsed.title}》共 ${parsed.chapters.length} 章`);
    } catch (e) {
      app.toast(e instanceof Error ? e.message : "载入失败", "error");
    } finally {
      setLoading(false);
    }
  };

  const openLink = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) savedRange.current = sel.getRangeAt(0).cloneRange();
    setLinkUrl("https://");
    setLinkOpen(true);
  };
  const applyLink = () => {
    if (savedRange.current) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(savedRange.current);
    }
    exec("createLink", linkUrl);
    setLinkOpen(false);
  };

  const insertImage = (f: File) => {
    const r = new FileReader();
    r.onload = () => exec("insertHTML", `<img src="${r.result}" alt="" style="max-width:100%;border-radius:4px"/>`);
    r.readAsDataURL(f);
  };

  const insertTable = () => {
    const cell = `<td style="border:1px solid #bbb;padding:6px 12px;min-width:60px">&nbsp;</td>`;
    exec("insertHTML", `<table style="border-collapse:collapse;margin:1em 0"><tbody>${`<tr>${cell}${cell}${cell}</tr>`.repeat(3)}</tbody></table><p></p>`);
  };

  const fullHtmlDoc = () => `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"/><title>${docTitle}</title>
<style>body{font-family:"Noto Serif SC",serif;max-width:44em;margin:2em auto;padding:0 1em;line-height:1.85;color:#2a322e}img{max-width:100%}blockquote{border-left:3px solid #c89b3c;padding-left:1em;color:#666}table{border-collapse:collapse}</style>
</head><body>${docHtml}</body></html>`;

  const saveEpub = async () => {
    setSaving("epub");
    try {
      const doc = new DOMParser().parseFromString(`<div id="r">${docHtml}</div>`, "text/html");
      const root = doc.getElementById("r");
      if (!root) throw new Error("内容为空");
      const groups: Array<{ title: string; nodes: Node[] }> = [];
      let cur: { title: string; nodes: Node[] } | null = null;
      Array.from(root.childNodes).forEach((n) => {
        const el = n as HTMLElement;
        if (el.nodeType === 1 && el.tagName === "H1") {
          cur = { title: el.textContent?.trim().slice(0, 40) || `章节 ${groups.length + 1}`, nodes: [] };
          groups.push(cur);
        } else {
          if (!cur) { cur = { title: "正文", nodes: [] }; groups.push(cur); }
          cur.nodes.push(n);
        }
      });
      const chapters = groups.filter((g) => g.nodes.length).map((g) => {
        const d = document.createElement("div");
        g.nodes.forEach((n) => d.appendChild(n.cloneNode(true)));
        return { title: g.title, html: d.innerHTML };
      });
      const blob = await buildEpub({ title: docTitle, author: "墨阁编辑器", chapters, version: 3 });
      saveAs(blob, `${docTitle}.epub`);
      app.toast(`已另存为 ${docTitle}.epub`);
    } catch (e) {
      app.toast(e instanceof Error ? e.message : "EPUB 保存失败", "error");
    } finally {
      setSaving("");
    }
  };

  const wordCount = stripHtml(docHtml).replace(/\s/g, "").length;

  const tabs: Array<{ key: Tab; label: string; icon: IconName }> = [
    { key: "rich", label: "富文本", icon: "pen" },
    { key: "html", label: "HTML 源码", icon: "code" },
    { key: "svg", label: "SVG 画板", icon: "image" },
  ];

  return (
    <div className="h-full flex flex-col app-bg overflow-hidden">
      <div className="max-w-6xl w-full mx-auto px-8 pt-8 flex-1 flex flex-col min-h-0">
        <ViewHeader
          kicker="Editor · 编辑"
          title="内容编辑器"
          desc="从书库载入正文继续编辑，或空白起步；成果可另存 HTML / DOCX / EPUB，SVG 画板独立成图。"
          right={
            <div className="flex items-center gap-2 flex-wrap">
              <select
                className="bg-card border border-line rounded-md px-3 py-2 text-xs outline-none focus:border-verm cursor-pointer transition-colors"
                value=""
                onChange={(e) => e.target.value && loadBook(e.target.value)}
              >
                <option value="">从书库载入…</option>
                {app.books.filter((b) => ["epub", "docx", "txt", "md", "html", "fb2", "svg"].includes(b.format)).map((b) => (
                  <option key={b.id} value={b.id}>{b.title}（{b.format.toUpperCase()}）</option>
                ))}
              </select>
              <input
                value={docTitle} onChange={(e) => setDocTitle(e.target.value)}
                className="bg-card border border-line rounded-md px-3 py-2 text-xs font-bold outline-none focus:border-verm w-40 transition-colors"
                title="文稿标题"
              />
            </div>
          }
        />

        <div className="flex items-center gap-3 flex-wrap mb-4">
          <div className="flex bg-card border border-line rounded-lg p-1 gap-0.5">
            {tabs.map((t) => (
              <button
                key={t.key} onClick={() => setTab(t.key)}
                className={`px-3.5 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${tab === t.key ? "bg-pine text-paper shadow" : "text-ink-soft hover:bg-line/60"}`}
              >
                <Icon name={t.icon} size={13} /> {t.label}
              </button>
            ))}
          </div>
          {tab !== "svg" && (
            <div className="flex items-center gap-1.5 ml-auto flex-wrap">
              <Btn size="sm" variant="ghost" onClick={() => { const b = new Blob([fullHtmlDoc()], { type: "text/html;charset=utf-8" }); saveAs(b, `${docTitle}.html`); app.toast("已下载 HTML"); }}>
                <Icon name="download" size={13} /> HTML
              </Btn>
              <Btn size="sm" variant="ghost" onClick={async () => { setSaving("docx"); try { saveAs(await htmlToDocxBlob(docTitle, "墨阁编辑器", docHtml), `${docTitle}.docx`); app.toast("已下载 DOCX"); } catch { app.toast("DOCX 保存失败", "error"); } finally { setSaving(""); } }}>
                {saving === "docx" ? <Spinner size={13} /> : <Icon name="download" size={13} />} DOCX
              </Btn>
              <Btn size="sm" variant="ghost" onClick={saveEpub}>
                {saving === "epub" ? <Spinner size={13} /> : <Icon name="download" size={13} />} EPUB
              </Btn>
              <Btn size="sm" onClick={() => app.addFiles([new File([fullHtmlDoc()], `${docTitle || "未命名文稿"}.html`, { type: "text/html" })])}>
                <Icon name="save" size={13} /> 存回书架
              </Btn>
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 mb-8">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-mist"><Spinner size={28} className="text-verm" /><p className="text-sm">正在载入正文…</p></div>
          ) : tab === "rich" ? (
            <div className="h-full flex flex-col bg-card border border-line rounded-xl overflow-hidden anim-fadeIn">
              <div className="flex items-center gap-0.5 px-2.5 py-1.5 border-b border-line bg-paper/70 flex-wrap">
                <EdBtn title="撤销" onClick={() => exec("undo")}><Icon name="undo" size={15} /></EdBtn>
                <EdBtn title="重做" onClick={() => exec("redo")}><Icon name="undo" size={15} className="-scale-x-100" /></EdBtn>
                <span className="w-px bg-line mx-1 self-center" style={{ height: 18 }} />
                <select
                  onChange={(e) => { if (e.target.value) exec("formatBlock", e.target.value); e.target.value = ""; }}
                  defaultValue=""
                  className="bg-transparent text-xs font-bold outline-none cursor-pointer px-1.5 py-1 rounded hover:bg-line/60 transition-colors"
                  title="段落格式"
                >
                  <option value="" disabled>段落</option>
                  <option value="p">正文</option>
                  <option value="h1">标题一</option>
                  <option value="h2">标题二</option>
                  <option value="h3">标题三</option>
                  <option value="blockquote">引文</option>
                </select>
                <span className="w-px bg-line mx-1 self-center" style={{ height: 18 }} />
                <EdBtn title="加粗" onClick={() => exec("bold")}><span className="font-black text-[13px]">B</span></EdBtn>
                <EdBtn title="斜体" onClick={() => exec("italic")}><span className="italic font-display text-[13px]">I</span></EdBtn>
                <EdBtn title="下划线" onClick={() => exec("underline")}><Icon name="underline" size={14} /></EdBtn>
                <EdBtn title="删除线" onClick={() => exec("strikeThrough")}><Icon name="strike" size={14} /></EdBtn>
                <EdBtn title="清除格式" onClick={() => exec("removeFormat")}><Icon name="x" size={14} /></EdBtn>
                <span className="w-px bg-line mx-1 self-center" style={{ height: 18 }} />
                <EdBtn title="无序列表" onClick={() => exec("insertUnorderedList")}><Icon name="list" size={14} /></EdBtn>
                <EdBtn title="有序列表" onClick={() => exec("insertOrderList")}><span className="text-[11px] font-black">1.</span></EdBtn>
                <EdBtn title="插入链接" onClick={openLink}><Icon name="arrowR" size={14} /></EdBtn>
                <EdBtn title="插入图片" onClick={() => imgRef.current?.click()}><Icon name="image" size={14} /></EdBtn>
                <EdBtn title="插入表格" onClick={insertTable}><Icon name="grid" size={14} /></EdBtn>
                <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) insertImage(e.target.files[0]); e.target.value = ""; }} />
                <span className="ml-auto text-[11px] text-mist tabular-nums pr-2">{wordCount.toLocaleString()} 字</span>
              </div>
              <div className="flex-1 overflow-y-auto theme-paper" style={{ background: "var(--rv-bg)", ["--rv-fs" as string]: "16.5px", ["--rv-lh" as string]: 1.85 }}>
                <div
                  ref={edRef}
                  contentEditable
                  suppressContentEditableWarning
                  className="rv-doc max-w-[44rem] mx-auto px-8 py-10 min-h-full outline-none"
                  onInput={syncFromDom}
                />
              </div>
              {linkOpen && (
                <div className="border-t border-line bg-paper px-4 py-2.5 flex items-center gap-2 anim-fadeIn">
                  <Icon name="arrowR" size={14} className="text-verm" />
                  <input
                    autoFocus value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && applyLink()}
                    className="flex-1 bg-card border border-line rounded-md px-3 py-1.5 text-xs outline-none focus:border-verm transition-colors"
                    placeholder="https://…"
                  />
                  <Btn size="sm" onClick={applyLink}>插入</Btn>
                  <Btn size="sm" variant="ghost" onClick={() => setLinkOpen(false)}>取消</Btn>
                </div>
              )}
            </div>
          ) : tab === "html" ? (
            <div className="h-full grid md:grid-cols-2 gap-4 anim-fadeIn">
              <div className="flex flex-col bg-card border border-line rounded-xl overflow-hidden min-h-0">
                <div className="px-4 py-2 border-b border-line bg-paper/70 text-[11px] font-bold text-mist flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><Icon name="code" size={13} /> 源码（直接编辑，即时同步）</span>
                  <span className="tabular-nums">{docHtml.length.toLocaleString()} 字符</span>
                </div>
                <textarea
                  value={docHtml} onChange={(e) => setDocHtml(e.target.value)} spellCheck={false}
                  className="flex-1 bg-[#14231c] text-[#d7e2d6] font-mono text-xs leading-relaxed p-4 outline-none resize-none min-h-0"
                />
              </div>
              <div className="flex flex-col bg-card border border-line rounded-xl overflow-hidden min-h-0">
                <div className="px-4 py-2 border-b border-line bg-paper/70 text-[11px] font-bold text-mist flex items-center gap-1.5">
                  <Icon name="bookOpen" size={13} /> 实时预览
                </div>
                <iframe
                  title="预览" sandbox="" className="flex-1 bg-white min-h-0"
                  srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:"Noto Serif SC",serif;max-width:42em;margin:1.6em auto;padding:0 1em;line-height:1.85;color:#2a322e}img{max-width:100%}blockquote{border-left:3px solid #c89b3c;padding-left:1em;color:#666}table{border-collapse:collapse}td,th{border:1px solid #bbb;padding:4px 10px}</style></head><body>${docHtml}</body></html>`}
                />
              </div>
            </div>
          ) : (
            <SvgEditor initial={svgInitial} title={docTitle} />
          )}
        </div>
      </div>
    </div>
  );
}

function EdBtn({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className="p-1.5 rounded-md text-ink-soft hover:text-ink hover:bg-line/70 transition-colors cursor-pointer inline-flex items-center justify-center min-w-[28px]" {...rest}>
      {children}
    </button>
  );
}
