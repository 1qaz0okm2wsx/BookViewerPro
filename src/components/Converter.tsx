import React, { useEffect, useMemo, useRef, useState } from "react";
import { saveAs } from "file-saver";
import { useApp } from "../store";
import { convertFile, targetsFor } from "../lib/convert";
import type { ConvertResult } from "../lib/convert";
import { detectFormat, titleFromFile } from "../lib/parse";
import { Icon } from "./icons";
import { Btn, Spinner, ViewHeader } from "./ui";
import { fmtSize, FORMAT_LABEL, FORMAT_COLOR, uid } from "../types";
import type { BookFormat, BookMeta } from "../types";

interface Source {
  name: string;
  blob: Blob;
  format: BookFormat;
  bookId?: string;
  meta?: BookMeta;
}

export default function Converter() {
  const app = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState<Source | null>(null);
  const [targetKey, setTargetKey] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [result, setResult] = useState<ConvertResult | null>(null);
  const [err, setErr] = useState("");

  const targets = useMemo(() => (src ? targetsFor(src.format) : []), [src]);
  useEffect(() => { setTargetKey(targets[0]?.key ?? ""); setResult(null); setErr(""); }, [targets]);

  const pickFile = async (f: File) => {
    setSrc({ name: f.name, blob: f, format: detectFormat(f.name) });
    setResult(null);
  };

  const pickLibrary = (id: string) => {
    const book = app.books.find((b) => b.id === id);
    if (!book) return;
    (async () => {
      const blob = await app.getBlob(id);
      if (blob) setSrc({ name: `${book.title}.${book.format}`, blob, format: book.format, bookId: id, meta: book });
    })();
  };

  const run = async () => {
    if (!src || !targetKey) return;
    setBusy(true);
    setErr("");
    setResult(null);
    try {
      const meta: BookMeta = src.meta ?? {
        id: `tmp-${uid()}`, title: titleFromFile(src.name), author: "—",
        format: src.format, size: src.blob.size, addedAt: Date.now(), source: "user",
      };
      const res = await convertFile(meta, src.blob, targetKey, setStage);
      setResult(res);
      app.addExport({
        name: res.filename, size: res.blob.size, format: res.format,
        bookId: src.bookId, bookTitle: src.meta?.title ?? titleFromFile(src.name), blob: res.blob,
      });
      app.toast(`转换完成：${res.filename}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "转换失败");
      app.toast("转换失败", "error");
    } finally {
      setBusy(false);
      setStage("");
    }
  };

  const saveToLibrary = () => {
    if (!result) return;
    const file = new File([result.blob], result.filename, { type: result.blob.type || "application/octet-stream" });
    app.addFiles([file]);
  };

  const MATRIX: Array<{ from: BookFormat; note: string }> = [
    { from: "epub", note: "→ EPUB2/3 · HTML · PDF · DOCX · TXT" },
    { from: "docx", note: "→ HTML · PDF · EPUB · MD · TXT" },
    { from: "md", note: "→ HTML · DOCX · PDF · EPUB · TXT" },
    { from: "txt", note: "→ DOCX · PDF · EPUB · HTML · MD" },
    { from: "html", note: "→ MD · DOCX · PDF · EPUB · TXT" },
    { from: "fb2", note: "→ HTML · PDF · EPUB · DOCX · TXT" },
    { from: "mobi", note: "→ HTML · PDF · EPUB · TXT" },
    { from: "pdf", note: "→ TXT（文本层提取）" },
    { from: "cbz", note: "→ PDF 画册" },
    { from: "svg", note: "→ PNG（2× 光栅化）" },
    { from: "image", note: "→ SVG 封装" },
  ];

  return (
    <div className="h-full overflow-y-auto app-bg">
      <div className="max-w-5xl mx-auto px-8 py-10">
        <ViewHeader
          kicker="Convert · 转换"
          title="格式转换器"
          desc="全部转换在本机完成：EPUB 版本重排、Office 互转、中文 PDF 光栅化排版、CBZ 合成画册、SVG 与位图互转。"
        />

        <div className="grid lg:grid-cols-[1fr_320px] gap-8 items-start">
          <div className="space-y-6">
            <section className="bg-card border border-line rounded-xl p-5 anim-fadeUp">
              <h3 className="text-[11px] font-bold tracking-[0.22em] text-mist uppercase mb-3">① 源文件</h3>
              <div className="flex gap-2 flex-wrap mb-4">
                <Btn variant="dark" size="sm" onClick={() => fileRef.current?.click()}><Icon name="upload" size={14} /> 选择本地文件</Btn>
                <select
                  className="bg-paper border border-line rounded-md px-3 py-1.5 text-xs outline-none focus:border-verm cursor-pointer"
                  value={src?.bookId ?? ""}
                  onChange={(e) => e.target.value && pickLibrary(e.target.value)}
                >
                  <option value="">…或从书库选择</option>
                  {app.books.map((b) => <option key={b.id} value={b.id}>{b.title}（{FORMAT_LABEL[b.format]}）</option>)}
                </select>
                <input ref={fileRef} type="file" className="hidden" onChange={(e) => { if (e.target.files?.[0]) pickFile(e.target.files[0]); e.target.value = ""; }} />
              </div>
              {src ? (
                <div className="flex items-center gap-3 bg-paper border border-line rounded-lg px-4 py-3 anim-pop">
                  <span className="text-[10px] font-black text-white px-2 py-1 rounded" style={{ background: FORMAT_COLOR[src.format] }}>{FORMAT_LABEL[src.format]}</span>
                  <span className="text-sm font-bold truncate flex-1">{src.name}</span>
                  <span className="text-[11px] text-mist tabular-nums shrink-0">{fmtSize(src.blob.size)}</span>
                  <button onClick={() => setSrc(null)} className="p-1 text-mist hover:text-verm cursor-pointer" title="更换"><Icon name="x" size={14} /></button>
                </div>
              ) : (
                <p className="text-xs text-mist border border-dashed border-line rounded-lg px-4 py-3.5">尚未选择文件。支持 EPUB / DOCX / MD / TXT / HTML / FB2 / MOBI / PDF / CBZ / SVG / 图片。</p>
              )}
            </section>

            <section className="bg-card border border-line rounded-xl p-5 anim-fadeUp" style={{ animationDelay: "70ms" }}>
              <h3 className="text-[11px] font-bold tracking-[0.22em] text-mist uppercase mb-3">② 目标格式</h3>
              {!src ? (
                <p className="text-xs text-mist">先选择源文件，这里会列出可转换的目标。</p>
              ) : targets.length === 0 ? (
                <p className="text-xs text-mist leading-relaxed">该格式（{FORMAT_LABEL[src.format]}）暂不支持在浏览器端转换。DRM 加密的 MOBI/AZW3 建议先用 Calibre 转为 EPUB。</p>
              ) : (
                <div className="flex gap-2.5 flex-wrap">
                  {targets.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setTargetKey(t.key)}
                      className={`px-4 py-2.5 rounded-lg border text-sm font-bold transition-all cursor-pointer ${
                        targetKey === t.key
                          ? "border-verm bg-verm text-white shadow-[0_4px_14px_-4px_rgba(198,67,31,.6)] scale-[1.03]"
                          : "border-line bg-paper text-ink-soft hover:border-verm/50 hover:text-verm"
                      }`}
                    >
                      {t.label}
                      <span className={`ml-1.5 text-[10px] font-normal ${targetKey === t.key ? "text-white/70" : "text-mist"}`}>.{t.ext}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-5 flex items-center gap-3 flex-wrap">
                <Btn size="lg" onClick={run} disabled={!src || !targetKey || busy} className="min-w-[150px]">
                  {busy ? <Spinner size={16} /> : <Icon name="swap" size={16} />}
                  {busy ? "转换中…" : "开始转换"}
                </Btn>
                {busy && stage && <span className="text-xs text-mist anim-fadeIn">{stage}</span>}
              </div>
              {err && (
                <p className="mt-3 text-xs text-verm bg-verm/[0.07] border border-verm/30 rounded-md px-3 py-2 anim-pop flex items-center gap-2">
                  <Icon name="alert" size={14} /> {err}
                </p>
              )}
            </section>

            {result && (
              <section className="bg-pine text-paper rounded-xl p-5 anim-pop">
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-lg bg-moss text-white flex items-center justify-center shrink-0"><Icon name="check" size={20} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-sm truncate">{result.filename}</p>
                    <p className="text-[11px] text-paper/55">{result.format} · {fmtSize(result.blob.size)} · 已存入会话导出列表</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-4 flex-wrap">
                  <Btn variant="gold" size="sm" onClick={() => saveAs(result.blob, result.filename)}><Icon name="download" size={14} /> 下载文件</Btn>
                  {/\.(epub|html?|txt|md|docx|svg|png|jpe?g)$/i.test(result.filename) && (
                    <Btn variant="ghost" size="sm" className="bg-transparent! text-paper! border-white/25! hover:border-white/60!" onClick={saveToLibrary}>
                      <Icon name="plus" size={14} /> 存回书架
                    </Btn>
                  )}
                  <Btn variant="ghost" size="sm" className="bg-transparent! text-paper/70! border-white/15! hover:border-white/50!" onClick={() => app.setView("export")}>
                    <Icon name="zip" size={14} /> 随书打包导出
                  </Btn>
                </div>
              </section>
            )}
          </div>

          <aside className="space-y-5">
            <div className="bg-card border border-line rounded-xl p-5 anim-fadeUp" style={{ animationDelay: "120ms" }}>
              <h3 className="font-display font-bold text-[15px] mb-3 flex items-center gap-2"><Icon name="grid" size={15} className="text-verm" /> 转换矩阵</h3>
              <ul className="space-y-2">
                {MATRIX.map((m) => (
                  <li key={m.from} className="text-[11px] leading-relaxed">
                    <span className="inline-block font-black text-white text-[9px] px-1.5 py-0.5 rounded mr-2" style={{ background: FORMAT_COLOR[m.from] }}>{FORMAT_LABEL[m.from]}</span>
                    <span className="text-mist">{m.note}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-card border border-line rounded-xl p-5 anim-fadeUp" style={{ animationDelay: "180ms" }}>
              <h3 className="font-display font-bold text-[15px] mb-3 flex items-center justify-between">
                <span className="flex items-center gap-2"><Icon name="clock" size={15} className="text-moss" /> 会话导出</span>
                <span className="text-[11px] text-mist font-body font-normal">{app.exports.length} 个</span>
              </h3>
              {app.exports.length === 0 ? (
                <p className="text-[11px] text-mist leading-relaxed">转换成果会暂存在这里，可在「导出」页随书籍与笔记一并打包成 ZIP。</p>
              ) : (
                <ul className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                  {app.exports.map((e) => (
                    <li key={e.id} className="group flex items-center gap-2 bg-paper border border-line rounded-md px-2.5 py-2">
                      <Icon name="file" size={13} className="text-moss shrink-0" />
                      <span className="text-[11px] font-bold truncate flex-1" title={e.name}>{e.name}</span>
                      <button onClick={() => saveAs(e.blob, e.name)} className="p-1 text-mist hover:text-verm cursor-pointer" title="下载"><Icon name="download" size={13} /></button>
                      <button onClick={() => app.removeExport(e.id)} className="p-1 text-mist hover:text-verm opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" title="移除"><Icon name="x" size={13} /></button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
