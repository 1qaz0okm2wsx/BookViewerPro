import React from "react";
import { AppProvider, useApp } from "./store";
import { Icon } from "./components/icons";
import type { IconName } from "./components/icons";
import { Spinner } from "./components/ui";
import Bookshelf from "./components/Bookshelf";
import ReaderView from "./components/Reader";
import Converter from "./components/Converter";
import Editor from "./components/Editor";
import NotesPanel from "./components/NotesPanel";
import StatsPanel from "./components/StatsPanel";
import OcrPanel from "./components/OcrPanel";
import AskPanel from "./components/AskPanel";
import GraphPanel from "./components/GraphPanel";
import ExportPanel from "./components/ExportPanel";
import type { View } from "./types";

const NAV: Array<{ key: View; label: string; icon: IconName; hint: string }> = [
  { key: "shelf", label: "书架", icon: "library", hint: "书库 · 标签 · 检索" },
  { key: "reader", label: "阅读", icon: "bookOpen", hint: "批注 · 自动滚动" },
  { key: "convert", label: "转换", icon: "swap", hint: "格式互转" },
  { key: "edit", label: "编辑", icon: "pen", hint: "富文本 · SVG" },
  { key: "notes", label: "笔记", icon: "note", hint: "批注与书签" },
  { key: "stats", label: "统计", icon: "chart", hint: "热力图 · 快捷键" },
  { key: "ocr", label: "识字", icon: "scan", hint: "扫描版 OCR" },
  { key: "ai", label: "AI 助手", icon: "brain", hint: "问答 · 翻译 · 排版" },
  { key: "graph", label: "图谱", icon: "network", hint: "知识网络 · 脑图" },
  { key: "export", label: "导出", icon: "box", hint: "打包为 ZIP" },
];

/* 错误边界：任何渲染异常都显示可读的诊断信息，而不是空白页 */
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("墨阁运行错误：", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="h-full flex items-center justify-center p-6" style={{ background: "#f1efe8" }}>
          <div className="bg-white border border-[#ded9ca] rounded-xl p-8 max-w-lg w-full shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <span className="w-11 h-11 rounded-lg bg-[#c6431f]/10 text-[#c6431f] flex items-center justify-center">
                <Icon name="alert" size={22} />
              </span>
              <div>
                <h1 className="font-bold text-lg" style={{ fontFamily: '"Noto Serif SC", serif' }}>界面遇到了意外错误</h1>
                <p className="text-xs text-[#8a948c]">应用已捕获异常，可尝试重载恢复</p>
              </div>
            </div>
            <pre className="text-[11px] bg-[#14231c] text-[#d7e2d6] rounded-lg p-3 overflow-auto max-h-40 whitespace-pre-wrap">
              {this.state.error.message}
              {"\n\n"}
              {this.state.error.stack?.slice(0, 600) ?? ""}
            </pre>
            <div className="flex gap-2 mt-5">
              <button onClick={() => window.location.reload()} className="px-4 py-2 rounded-md bg-[#c6431f] text-white text-sm font-bold cursor-pointer hover:bg-[#a2320f] transition-colors">重新加载</button>
              <button onClick={() => this.setState({ error: null })} className="px-4 py-2 rounded-md border border-[#ded9ca] text-sm cursor-pointer hover:bg-[#f1efe8] transition-colors">尝试继续</button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function Shell() {
  const app = useApp();

  if (!app.ready) {
    return (
      <div className="h-full sidebar-bg flex flex-col items-center justify-center gap-5 text-[#f1efe8]">
        <div className="text-center anim-fadeUp">
          <p className="text-6xl leading-none" style={{ fontFamily: '"Ma Shan Zheng", "Noto Serif SC", cursive', color: "#ecd9a8" }}>墨阁</p>
          <p className="text-[11px] tracking-[0.42em] opacity-50 mt-3 uppercase">BookViewer Pro</p>
        </div>
        <div className="flex items-center gap-2.5 opacity-60 text-sm anim-fadeIn" style={{ animationDelay: "300ms" }}>
          <Spinner size={17} className="text-[#c89b3c]" /> 正在开启本地书库…
        </div>
      </div>
    );
  }

  const badge = (k: View) =>
    k === "notes" ? app.annotations.length + app.bookmarks.length : k === "export" ? app.exports.length : 0;

  return (
    <div className="h-full flex overflow-hidden">
      {/* ===== 侧栏 ===== */}
      <aside className="sidebar-bg w-[64px] md:w-[216px] shrink-0 flex flex-col text-[#f1efe8]/85 border-r border-black/30">
        <button className="flex items-center gap-2.5 px-3.5 md:px-5 pt-5 pb-4 text-left cursor-pointer group" onClick={() => app.setView("shelf")}>
          <span className="w-9 h-9 rounded-lg bg-gradient-to-br from-gold to-[#a87f2a] text-pine flex items-center justify-center shrink-0 shadow-[0_4px_14px_-4px_rgba(200,155,60,.7)] transition-transform group-hover:-rotate-6">
            <Icon name="book" size={18} strokeWidth={2} />
          </span>
          <span className="hidden md:block min-w-0">
            <span className="text-[24px] leading-none text-gold-soft block" style={{ fontFamily: '"Ma Shan Zheng", "Noto Serif SC", cursive' }}>墨阁</span>
            <span className="text-[8px] tracking-[0.3em] text-[#f1efe8]/40 uppercase block mt-1">BookViewer Pro</span>
          </span>
        </button>

        <nav className="flex-1 px-2 md:px-3 space-y-0.5 overflow-y-auto">
          {NAV.map((n) => {
            const active = app.view === n.key;
            const count = badge(n.key);
            return (
              <button
                key={n.key}
                onClick={() => app.setView(n.key)}
                title={`${n.label} · ${n.hint}`}
                className={`relative w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all duration-150 cursor-pointer ${
                  active ? "bg-white/[0.09] text-white" : "text-[#f1efe8]/60 hover:text-[#f1efe8] hover:bg-white/[0.05] hover:translate-x-0.5"
                }`}
              >
                {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r bg-verm" />}
                <Icon name={n.icon} size={17} className={active ? "text-gold" : ""} />
                <span className="hidden md:block flex-1 text-left">
                  <span className={`block text-[13px] font-bold leading-tight ${active ? "" : "font-medium"}`}>{n.label}</span>
                  <span className="block text-[9px] text-[#f1efe8]/35 leading-tight mt-px">{n.hint}</span>
                </span>
                {count > 0 && (
                  <span className={`hidden md:inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums ${active ? "bg-verm text-white" : "bg-white/10 text-[#f1efe8]/60"}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="px-3.5 md:px-4 pb-4 pt-2.5 space-y-2">
          <div className="hidden md:flex items-center justify-between text-[11px] text-[#f1efe8]/45">
            <span className="flex items-center gap-1.5"><Icon name="book" size={12} /> 藏书 <strong className="text-[#f1efe8]/80 tabular-nums">{app.books.length}</strong></span>
            <span className="flex items-center gap-1.5"><Icon name="note" size={12} /> 笔记 <strong className="text-[#f1efe8]/80 tabular-nums">{app.annotations.length}</strong></span>
          </div>
          <div className="hidden md:block h-px bg-white/10" />
          <p className="hidden md:flex items-center gap-1.5 text-[10px] text-[#f1efe8]/30 leading-relaxed">
            <Icon name="shield" size={11} className="shrink-0" />
            纯本地运行 · 数据不出此设备
          </p>
          <p className="md:hidden flex justify-center text-[#f1efe8]/30"><Icon name="shield" size={13} /></p>
        </div>
      </aside>

      {/* ===== 主区 ===== */}
      <main className="flex-1 min-w-0 relative">
        <div key={app.view} className="h-full">
          {app.view === "shelf" && <Bookshelf />}
          {app.view === "reader" && <ReaderView />}
          {app.view === "convert" && <Converter />}
          {app.view === "edit" && <Editor />}
          {app.view === "notes" && <NotesPanel />}
          {app.view === "stats" && <StatsPanel />}
          {app.view === "ocr" && <OcrPanel />}
          {app.view === "ai" && <AskPanel />}
          {app.view === "graph" && <GraphPanel />}
          {app.view === "export" && <ExportPanel />}
        </div>
      </main>

      {/* ===== Toast ===== */}
      <div className="fixed bottom-5 right-5 z-[60] space-y-2 w-[300px]">
        {app.toasts.map((t) => (
          <div
            key={t.id}
            className={`anim-toast flex items-start gap-2.5 px-3.5 py-3 rounded-lg shadow-2xl border text-[13px] leading-snug cursor-pointer ${
              t.kind === "success" ? "bg-pine text-[#f1efe8] border-moss/50"
              : t.kind === "error" ? "bg-[#3a130a] text-[#ffd9c9] border-verm/60"
              : "bg-card text-ink border-line"
            }`}
            onClick={() => app.dismissToast(t.id)}
          >
            <Icon
              name={t.kind === "success" ? "check" : t.kind === "error" ? "alert" : "info"}
              size={15}
              className={t.kind === "success" ? "text-gold mt-0.5" : t.kind === "error" ? "text-[#ff9a70] mt-0.5" : "text-verm mt-0.5"}
            />
            <span className="flex-1">{t.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <Shell />
      </AppProvider>
    </ErrorBoundary>
  );
}
