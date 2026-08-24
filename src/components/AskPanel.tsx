/** AI 助手：① 智能问答（RAG 检索 + 本地/云端 LLM）② 自然语言排版引擎 ③ 双语对照 */
import React, { useState } from "react";
import { useApp } from "../store";
import { parseBook } from "../lib/parse";
import { buildIndex, searchIndex, embedQuery, type SearchIndex, type Chunk } from "../ai/rag";
import { loadLlmSettings, saveLlmSettings, testConnection, chat, type LlmSettings } from "../ai/llm";
import { styleFromPrompt, STYLE_PRESETS } from "../ai/styleEngine";
import BilingualView from "../translation/BilingualView";
import { Icon } from "./icons";
import { Btn, Spinner, ViewHeader } from "./ui";
import type { ParsedBook } from "../types";

type Tab = "ask" | "style" | "bilingual";

interface QaMsg {
  role: "user" | "assistant";
  content: string;
  cites?: Chunk[];
  mode?: string;
}

/* ================= 智能问答 ================= */
function AskTab() {
  const app = useApp();
  const textBooks = app.books.filter((b) => !["pdf", "image", "cbz"].includes(b.format));
  const [bookId, setBookId] = useState("");
  const [parsed, setParsed] = useState<ParsedBook | null>(null);
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [indexing, setIndexing] = useState(false);
  const [stage, setStage] = useState("");
  const [q, setQ] = useState("");
  const [msgs, setMsgs] = useState<QaMsg[]>([]);
  const [asking, setAsking] = useState(false);
  const [showCfg, setShowCfg] = useState(false);
  const [cfg, setCfg] = useState<LlmSettings>(loadLlmSettings());
  const [testing, setTesting] = useState(false);

  const book = textBooks.find((b) => b.id === bookId) ?? null;

  const pickBook = async (id: string) => {
    setBookId(id);
    setParsed(null);
    setIndex(null);
    setMsgs([]);
    const b = textBooks.find((x) => x.id === id);
    if (!b) return;
    const blob = await app.getBlob(id);
    if (!blob) return;
    try {
      setParsed(await parseBook(b, blob));
    } catch (e) {
      app.toast(e instanceof Error ? e.message : "解析失败", "error");
    }
  };

  const buildIdx = async () => {
    if (!book || !parsed || indexing) return;
    setIndexing(true);
    try {
      const idx = await buildIndex(book.id, parsed, setStage);
      setIndex(idx);
      app.toast(idx.mode === "vector" ? "向量索引构建完成" : "已建立本地关键词索引", idx.mode === "vector" ? "success" : "info");
    } catch (e) {
      app.toast(e instanceof Error ? e.message : "索引失败", "error");
    } finally {
      setIndexing(false);
      setStage("");
    }
  };

  const ask = async () => {
    const query = q.trim();
    if (!query || !index || !book || asking) return;
    setAsking(true);
    setQ("");
    setMsgs((m) => [...m, { role: "user", content: query }]);
    try {
      const qVec = index.mode === "vector" ? await embedQuery(query) : null;
      const hits = searchIndex(index, query, qVec, 4);
      if (!hits.length) {
        setMsgs((m) => [...m, { role: "assistant", content: "没有检索到相关内容，换个问法试试。" }]);
        return;
      }
      const context = hits.map((h, i) => `【原文片段${i + 1} · ${h.chapterTitle}】\n${h.text}`).join("\n\n");
      let answer = "";
      let mode = "";
      try {
        answer = await chat(cfg, [
          { role: "system", content: "你是这本书的随书助手。只依据给出的原文片段回答，引用时注明片段编号；若片段不足以回答，如实说明。回答简洁、用中文。" },
          { role: "user", content: `原文片段：\n${context}\n\n读者提问：${query}` },
        ]);
        mode = cfg.provider === "ollama" ? `Ollama · ${cfg.model}` : `云端 · ${cfg.model}`;
      } catch {
        answer = `（LLM 不可用，直接呈现检索到的相关原文）\n\n${hits.map((h, i) => `${i + 1}. 「${h.text}」\n—— ${h.chapterTitle}`).join("\n\n")}`;
        mode = "本地检索模式";
      }
      setMsgs((m) => [...m, { role: "assistant", content: answer, cites: hits, mode }]);
    } finally {
      setAsking(false);
    }
  };

  const locate = (c: Chunk) => {
    app.setPendingJump({ bookId: c.bookId, chapterId: c.chapterId });
    app.openBook(c.bookId);
  };

  return (
    <div className="grid lg:grid-cols-[320px_1fr] gap-5 items-start">
      <div className="space-y-4">
        <div>
          <p className="text-[10px] font-bold tracking-[0.2em] text-mist uppercase mb-1.5">选择要提问的书</p>
          <select value={bookId} onChange={(e) => pickBook(e.target.value)} className="w-full bg-paper border border-line rounded-md px-2.5 py-2 text-xs outline-none focus:border-verm cursor-pointer">
            <option value="">选择一本书…</option>
            {textBooks.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
          </select>
        </div>

        <button onClick={() => buildIdx()} disabled={!parsed || indexing} className="w-full flex items-center gap-3 p-3.5 rounded-lg border border-line bg-paper hover:border-moss/60 transition-all cursor-pointer disabled:opacity-45 text-left">
          <span className="w-9 h-9 rounded-lg bg-moss/15 text-moss flex items-center justify-center shrink-0">{indexing ? <Spinner size={16} /> : <Icon name="brain" size={17} />}</span>
          <span>
            <span className="block text-xs font-bold">{index ? `索引就绪 · ${index.chunks.length} 段 · ${index.mode === "vector" ? "向量检索" : "关键词检索"}` : "构建全书索引"}</span>
            <span className="block text-[10px] text-mist mt-0.5">{stage || (index ? "点击可重建" : "向量化全书文本，用于检索增强问答")}</span>
          </span>
        </button>

        {/* LLM 设置 */}
        <div className="border border-line rounded-lg bg-card overflow-hidden">
          <button onClick={() => setShowCfg((v) => !v)} className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-bold cursor-pointer hover:bg-paper transition-colors">
            <span className="flex items-center gap-1.5"><Icon name="gear" size={13} className="text-mist" /> 模型接入</span>
            <Icon name="chevD" size={13} className={`text-mist transition-transform ${showCfg ? "rotate-180" : ""}`} />
          </button>
          {showCfg && (
            <div className="px-3.5 pb-3.5 space-y-2 anim-fadeIn">
              <div className="flex gap-1.5">
                {(["ollama", "openai"] as const).map((p) => (
                  <button key={p} onClick={() => setCfg((c) => ({ ...c, provider: p, baseUrl: p === "ollama" ? "http://localhost:11434" : "https://api.openai.com/v1" }))}
                    className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-bold border transition-all cursor-pointer ${cfg.provider === p ? "bg-pine text-paper border-pine" : "border-line hover:border-ink/40"}`}>
                    {p === "ollama" ? "本地 Ollama" : "OpenAI 兼容"}
                  </button>
                ))}
              </div>
              <input value={cfg.baseUrl} onChange={(e) => setCfg((c) => ({ ...c, baseUrl: e.target.value }))} placeholder="Base URL" className="w-full bg-paper border border-line rounded-md px-2.5 py-1.5 text-[11px] outline-none focus:border-verm" />
              <input value={cfg.model} onChange={(e) => setCfg((c) => ({ ...c, model: e.target.value }))} placeholder="模型名（如 qwen2.5）" className="w-full bg-paper border border-line rounded-md px-2.5 py-1.5 text-[11px] outline-none focus:border-verm" />
              {cfg.provider === "openai" && (
                <input type="password" value={cfg.apiKey} onChange={(e) => setCfg((c) => ({ ...c, apiKey: e.target.value }))} placeholder="API Key（仅存本地）" className="w-full bg-paper border border-line rounded-md px-2.5 py-1.5 text-[11px] outline-none focus:border-verm" />
              )}
              <div className="flex gap-1.5">
                <Btn size="sm" variant="ghost" className="flex-1" onClick={() => { saveLlmSettings(cfg); app.toast("模型配置已保存（仅存本机）"); }}>保存</Btn>
                <Btn size="sm" variant="ghost" className="flex-1" disabled={testing} onClick={async () => { setTesting(true); try { const r = await testConnection(cfg); app.toast(`连接成功：${r}`); } catch (e) { app.toast(e instanceof Error ? e.message : "连接失败", "error"); } finally { setTesting(false); } }}>
                  {testing ? <Spinner size={12} /> : <Icon name="check" size={12} />} 测试
                </Btn>
              </div>
              <p className="text-[10px] text-mist leading-relaxed">Ollama 用法：本机 <code className="bg-line/50 px-1 rounded">ollama serve</code> 后 <code className="bg-line/50 px-1 rounded">ollama pull qwen2.5</code>。不配置也能用——自动回退为纯本地检索摘录。</p>
            </div>
          )}
        </div>
      </div>

      {/* 对话区 */}
      <div className="bg-card border border-line rounded-xl flex flex-col h-[58vh]">
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {!book ? (
            <div className="h-full flex flex-col items-center justify-center text-mist">
              <Icon name="brain" size={40} strokeWidth={1.2} className="mb-4 opacity-40" />
              <p className="text-sm">选择一本书并构建索引，然后向它提问</p>
              <p className="text-[11px] mt-1.5 opacity-70">例：「这本书开篇讲了什么？」「找出关于『仁』的论述」</p>
            </div>
          ) : msgs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-mist">
              <p className="font-display font-bold text-base text-ink mb-2">《{book.title}》随书问答</p>
              <p className="text-xs">{index ? "索引就绪，输入问题开始" : "先点击左侧「构建全书索引」"}</p>
            </div>
          ) : (
            msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} anim-fadeUp`}>
                <div className={`max-w-[86%] rounded-xl px-4 py-3 text-[13px] leading-relaxed whitespace-pre-wrap ${m.role === "user" ? "bg-pine text-paper rounded-br-sm" : "bg-paper border border-line rounded-bl-sm"}`}>
                  {m.mode && <p className="text-[10px] font-bold text-moss mb-1.5 flex items-center gap-1"><Icon name="spark" size={10} /> {m.mode}</p>}
                  {m.content}
                  {m.cites && m.cites.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2.5 border-t border-line/70">
                      {m.cites.map((c, ci) => (
                        <button key={ci} onClick={() => locate(c)} className="text-[10px] px-2 py-1 rounded-full bg-moss/10 text-moss hover:bg-moss/20 transition-colors cursor-pointer" title={c.text.slice(0, 60)}>
                          原文出处 {ci + 1} · {c.chapterTitle} ↗
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          {asking && (
            <div className="flex justify-start anim-fadeIn">
              <div className="bg-paper border border-line rounded-xl rounded-bl-sm px-4 py-3 flex items-center gap-2 text-xs text-mist">
                <Spinner size={13} className="text-verm" /> 正在检索原文并组织回答…
              </div>
            </div>
          )}
        </div>
        <div className="border-t border-line p-3.5 flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask()}
            placeholder={index ? "针对这本书提问…" : "构建索引后可提问"}
            disabled={!index || asking}
            className="flex-1 bg-paper border border-line rounded-md px-3.5 py-2.5 text-sm outline-none focus:border-verm transition-colors disabled:opacity-50"
          />
          <Btn onClick={ask} disabled={!index || !q.trim() || asking}><Icon name="arrowR" size={15} /> 提问</Btn>
        </div>
      </div>
    </div>
  );
}

/* ================= 自然语言排版引擎 ================= */
function StyleTab() {
  const app = useApp();
  const [prompt, setPrompt] = useState("背景米黄色，正文思源宋体，字号18，行距2.0，首行缩进");
  const [preview, setPreview] = useState("");

  const apply = (p: string) => {
    const { css, summary } = styleFromPrompt(p);
    setPreview(css);
    if (!css) {
      app.toast(summary[0] ?? "未识别到排版指令", "info");
      return;
    }
    localStorage.setItem("bv.customcss", css);
    window.dispatchEvent(new CustomEvent("bv:customcss"));
    app.toast(`已应用到阅读器：${summary.join("；")}`);
  };

  const clear = () => {
    localStorage.removeItem("bv.customcss");
    window.dispatchEvent(new CustomEvent("bv:customcss"));
    setPreview("");
    app.toast("已恢复默认排版", "info");
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6 items-start">
      <div className="space-y-4">
        <div className="bg-card border border-line rounded-xl p-5">
          <h3 className="font-display font-bold text-[15px] mb-2 flex items-center gap-2"><Icon name="wand" size={16} className="text-gold" /> 用一句话定制阅读版式</h3>
          <p className="text-[11px] text-mist mb-3.5 leading-relaxed">样式引擎会把自然语言解析为 CSS 并实时注入阅读器，无需手写代码。</p>
          <div className="flex gap-1.5 flex-wrap mb-3">
            {STYLE_PRESETS.map((p) => (
              <button key={p.label} onClick={() => { setPrompt(p.prompt); apply(p.prompt); }} className="text-[11px] px-2.5 py-1.5 rounded-full border border-line bg-paper hover:border-gold hover:text-gold transition-all cursor-pointer font-medium">
                {p.label}
              </button>
            ))}
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            className="w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm outline-none focus:border-verm resize-none transition-colors"
          />
          <div className="flex gap-2 mt-3">
            <Btn onClick={() => apply(prompt)}><Icon name="wand" size={14} /> 生成并应用</Btn>
            <Btn variant="ghost" onClick={clear}><Icon name="undo" size={14} /> 恢复默认</Btn>
          </div>
        </div>
        <div className="bg-card border border-line rounded-xl p-5">
          <p className="text-[10px] font-bold tracking-[0.2em] text-mist uppercase mb-2">生成的 CSS</p>
          <pre className="text-[11px] bg-pine text-[#d7e2d6] rounded-lg p-3.5 overflow-auto max-h-40 font-mono leading-relaxed">{preview || "/* 点击「生成并应用」后显示 */"}</pre>
        </div>
      </div>
      <div className="rounded-xl border border-line overflow-hidden cover-shadow">
        <div className="bg-pine text-paper px-4 py-2 text-[11px] font-bold flex items-center gap-1.5"><Icon name="bookOpen" size={12} className="text-gold" /> 实时预览（与阅读器同步）</div>
        <div className="p-8" style={{ background: "#fcfbf6" }}>
          {preview ? <style>{preview}</style> : null}
          <div className="rv-doc" style={{ ["--rv-fg" as string]: "#2a322e", fontSize: 16 }}>
            <h2>湖心亭看雪 · 张岱</h2>
            <p>崇祯五年十二月，余住西湖。大雪三日，湖中人鸟声俱绝。是日更定矣，余拏一小舟，拥毳衣炉火，独往湖心亭看雪。</p>
            <p>雾凇沆砀，天与云与山与水，上下一白。湖上影子，惟长堤一痕、湖心亭一点、与余舟一芥、舟中人两三粒而已。</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================= 主视图 ================= */
export default function AskPanel() {
  const [tab, setTab] = useState<Tab>("ask");
  const tabs: Array<{ key: Tab; label: string; icon: React.ComponentProps<typeof Icon>["name"]; desc: string }> = [
    { key: "ask", label: "智能问答", icon: "brain", desc: "RAG 检索增强 · 回答附带原文出处，点击直达原文" },
    { key: "style", label: "阅读排版", icon: "wand", desc: "自然语言指令生成 CSS，一句话换一套阅读风格" },
    { key: "bilingual", label: "双语对照", icon: "globe", desc: "所视即所译 · 段落缓存 · 一键全本翻译与双语导出" },
  ];
  const cur = tabs.find((t) => t.key === tab)!;

  return (
    <div className="h-full overflow-y-auto app-bg">
      <div className="max-w-6xl mx-auto px-8 py-10">
        <ViewHeader
          kicker="AI Copilot · 智能"
          title="AI 助手"
          desc="向量检索问答、自然语言排版、上下文感知翻译——推理可用本地 Ollama 或自有 API，数据始终不出本机。"
        />
        <div className="flex items-center gap-2 flex-wrap mb-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-bold transition-all cursor-pointer ${tab === t.key ? "bg-pine text-paper border-pine shadow-lg" : "border-line bg-card text-ink-soft hover:border-ink/35"}`}
            >
              <Icon name={t.icon} size={15} className={tab === t.key ? "text-gold" : ""} /> {t.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-mist mb-6 flex items-center gap-1.5"><Icon name="info" size={12} /> {cur.desc}</p>
        <div key={tab} className="anim-fadeIn">
          {tab === "ask" && <AskTab />}
          {tab === "style" && <StyleTab />}
          {tab === "bilingual" && <BilingualView />}
        </div>
      </div>
    </div>
  );
}
