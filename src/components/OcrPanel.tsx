import React, { useRef, useState } from "react";
import { saveAs } from "file-saver";
import { useApp } from "../store";
import { parseBook, getCbzImage } from "../lib/parse";
import pdfjs from "../lib/pdf";
import { recognizeImage, saveOcrPage, getOcrMap } from "../lib/ocr";
import { buildSearchablePdf } from "../lib/searchablePdf";
import type { SearchablePage } from "../lib/searchablePdf";
import { Icon } from "./icons";
import { Btn, ProgressBar, Spinner, ViewHeader } from "./ui";
import { fmtSize, FORMAT_LABEL } from "../types";
import type { OcrBookMap, ParsedBook } from "../types";

type PdfDoc = { numPages: number; getPage: (n: number) => Promise<{ getViewport: (o: { scale: number }) => { width: number; height: number }; render: (o: unknown) => { promise: Promise<void> } }> };

export default function OcrPanel() {
  const app = useApp();
  const candidates = app.books.filter((b) => ["pdf", "image", "cbz"].includes(b.format));
  const [bookId, setBookId] = useState("");
  const book = candidates.find((b) => b.id === bookId) ?? null;

  const [map, setMap] = useState<OcrBookMap>({});
  const [pageTotal, setPageTotal] = useState(0);
  const [from, setFrom] = useState("1");
  const [to, setTo] = useState("5");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [prog, setProg] = useState({ cur: 0, total: 0 });
  const [exporting, setExporting] = useState(false);
  const [loadingBook, setLoadingBook] = useState(false);
  const cancelRef = useRef(false);
  const parsedRef = useRef<ParsedBook | null>(null);
  const pdfDocRef = useRef<PdfDoc | null>(null);

  const recognized = Object.keys(map).map(Number).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b);
  const totalChars = recognized.reduce((s, p) => s + (map[String(p)]?.text.length ?? 0), 0);

  const selectBook = async (id: string) => {
    setBookId(id);
    setMap({});
    setPageTotal(0);
    parsedRef.current = null;
    pdfDocRef.current = null;
    const b = candidates.find((x) => x.id === id);
    if (!b) return;
    setLoadingBook(true);
    try {
      setMap(await getOcrMap(id));
      const blob = await app.getBlob(id);
      if (!blob) throw new Error("本地存储中找不到该书文件");
      if (b.format === "pdf") {
        const doc = (await pdfjs.getDocument({ data: new Uint8Array((await blob.arrayBuffer()).slice(0)) }).promise) as unknown as PdfDoc;
        pdfDocRef.current = doc;
        setPageTotal(doc.numPages);
        setTo(String(Math.min(5, doc.numPages)));
      } else {
        const parsed = await parseBook(b, blob);
        parsedRef.current = parsed;
        setPageTotal(parsed.imageCount);
        setTo(String(Math.min(5, parsed.imageCount)));
      }
    } catch (e) {
      app.toast(e instanceof Error ? e.message : "打开失败", "error");
    } finally {
      setLoadingBook(false);
    }
  };

  /** 取第 idx 页（1 基）的图像 dataURL，宽度限制 1600px */
  const pageImage = async (idx: number): Promise<string> => {
    if (!book) throw new Error("未选择书籍");
    if (book.format === "pdf") {
      const doc = pdfDocRef.current;
      if (!doc) throw new Error("PDF 尚未就绪");
      const pg = await doc.getPage(idx);
      const vp1 = pg.getViewport({ scale: 1 });
      const scale = Math.min(2.2, 1600 / vp1.width);
      const vp = pg.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("画布初始化失败");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await pg.render({ canvasContext: ctx, viewport: vp } as unknown).promise;
      return canvas.toDataURL("image/png");
    }
    if (book.format === "image") {
      if (!parsedRef.current?.imageDataUrl) throw new Error("图像尚未就绪");
      return parsedRef.current.imageDataUrl;
    }
    return getCbzImage(book.id, idx - 1);
  };

  const run = async () => {
    if (!book || busy) return;
    const f = Math.max(1, parseInt(from, 10) || 1);
    const t = Math.min(pageTotal, Math.max(f, parseInt(to, 10) || f));
    cancelRef.current = false;
    setBusy(true);
    setProg({ cur: 0, total: t - f + 1 });
    try {
      for (let i = f; i <= t; i++) {
        if (cancelRef.current) { app.toast("已取消识别", "info"); break; }
        setProg({ cur: i - f, total: t - f + 1 });
        setStage(`正在准备第 ${i} 页图像…`);
        const img = await pageImage(i);
        const res = await recognizeImage(img, i, (p, st) => setStage(`第 ${i}/${t} 页 · ${st} ${(p * 100).toFixed(0)}%`));
        await saveOcrPage(book.id, res);
        setMap((m) => ({ ...m, [String(i)]: res }));
      }
      setProg((p) => ({ ...p, cur: p.total }));
      app.toast("OCR 识别完成，文字层已写入本书");
    } catch (e) {
      app.toast(e instanceof Error ? e.message : "识别失败", "error");
    } finally {
      setBusy(false);
      setStage("");
    }
  };

  const exportPdf = async () => {
    if (!book || book.format !== "pdf" || !recognized.length || exporting) return;
    setExporting(true);
    try {
      const pages: SearchablePage[] = [];
      for (const p of recognized) {
        setStage(`正在合成第 ${p} 页…`);
        const img = await pageImage(p);
        pages.push({ imageDataUrl: img, ocr: map[String(p)] });
      }
      setStage("正在嵌入隐藏文本层…");
      const { blob, cjk } = await buildSearchablePdf(pages, book.title, setStage);
      saveAs(blob, `${book.title}_可检索.pdf`);
      app.toast(cjk ? "已导出可检索 PDF（含中文字体子集）" : "已导出（未获取中文字体，文本层为 ASCII 回退）", cjk ? "success" : "info");
    } catch (e) {
      app.toast(e instanceof Error ? e.message : "导出失败", "error");
    } finally {
      setExporting(false);
      setStage("");
    }
  };

  const copyAll = async () => {
    const text = recognized.map((p) => `—— 第 ${p} 页 ——\n${map[String(p)]?.text ?? ""}`).join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      app.toast(`已复制 ${totalChars.toLocaleString()} 字`);
    } catch {
      app.toast("复制失败，浏览器未授权剪贴板", "error");
    }
  };

  return (
    <div className="h-full overflow-y-auto app-bg">
      <div className="max-w-5xl mx-auto px-8 py-10">
        <ViewHeader
          kicker="OCR · 识字"
          title="扫描版文字识别"
          desc="用 tesseract.js 在本地识别扫描版 PDF 与图片中的中英文，生成透明文字层——阅读时可全文搜索、选中复制，还能导出可检索 PDF。"
        />

        <div className="grid lg:grid-cols-[340px_1fr] gap-6 items-start">
          {/* 左：选书与控制 */}
          <div className="space-y-5">
            <section className="bg-card border border-line rounded-xl p-5 anim-fadeUp">
              <h3 className="text-[11px] font-bold tracking-[0.22em] text-mist uppercase mb-3">① 选择扫描版书籍</h3>
              {candidates.length === 0 ? (
                <p className="text-xs text-mist leading-relaxed">书库中还没有 PDF / 图片 / CBZ 格式的书籍。去书架导入一本扫描版再来。</p>
              ) : (
                <ul className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {candidates.map((b) => (
                    <li key={b.id}>
                      <button
                        onClick={() => selectBook(b.id)}
                        className={`w-full flex items-center gap-2.5 p-2 rounded-lg border text-left transition-all cursor-pointer ${bookId === b.id ? "border-verm bg-verm/[0.07]" : "border-line hover:border-ink/30"}`}
                      >
                        {b.cover ? <img src={b.cover} alt="" className="w-7 h-9 rounded-[2px] object-cover" /> : <span className="w-7 h-9 rounded-[2px] bg-line flex items-center justify-center"><Icon name="scan" size={13} className="text-mist" /></span>}
                        <span className="min-w-0 flex-1">
                          <span className={`block text-xs font-bold truncate ${bookId === b.id ? "text-verm" : "text-ink"}`}>{b.title}</span>
                          <span className="block text-[10px] text-mist">{FORMAT_LABEL[b.format]} · {fmtSize(b.size)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {book && (
              <section className="bg-card border border-line rounded-xl p-5 anim-fadeUp" style={{ animationDelay: "80ms" }}>
                <h3 className="text-[11px] font-bold tracking-[0.22em] text-mist uppercase mb-3">② 识别范围（共 {pageTotal} 页）</h3>
                {loadingBook ? (
                  <div className="flex items-center gap-2 text-xs text-mist py-2"><Spinner size={15} className="text-verm" /> 正在读取…</div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <input value={from} onChange={(e) => setFrom(e.target.value)} className="w-16 bg-paper border border-line rounded-md px-2 py-1.5 text-xs text-center outline-none focus:border-verm" aria-label="起始页" />
                      <span className="text-mist text-xs">至</span>
                      <input value={to} onChange={(e) => setTo(e.target.value)} className="w-16 bg-paper border border-line rounded-md px-2 py-1.5 text-xs text-center outline-none focus:border-verm" aria-label="结束页" />
                      <span className="text-[10px] text-mist">单次建议 ≤ 30 页</span>
                    </div>
                    <div className="flex gap-2 mt-4">
                      <Btn onClick={run} disabled={busy || !pageTotal} className="flex-1">
                        {busy ? <Spinner size={15} /> : <Icon name="scan" size={15} />}
                        {busy ? "识别中…" : "开始识别"}
                      </Btn>
                      {busy && <Btn variant="ghost" onClick={() => { cancelRef.current = true; }}>取消</Btn>}
                    </div>
                    {(busy || exporting) && (
                      <div className="mt-4">
                        <p className="text-[11px] text-mist mb-1.5 anim-fadeIn">{stage || "初始化 OCR 引擎（首次需下载约 15MB 语言包）…"}</p>
                        <ProgressBar value={prog.total ? prog.cur / prog.total : 0.06} className="stripe-live" />
                      </div>
                    )}
                  </>
                )}
              </section>
            )}

            {book && recognized.length > 0 && (
              <section className="bg-pine text-paper rounded-xl p-5 anim-pop">
                <p className="text-xs mb-3">已识别 <strong className="text-gold">{recognized.length}</strong> 页 · <strong className="text-gold">{totalChars.toLocaleString()}</strong> 字</p>
                <div className="flex gap-2 flex-wrap">
                  {book.format === "pdf" && (
                    <Btn variant="gold" size="sm" onClick={exportPdf} disabled={exporting}>
                      {exporting ? <Spinner size={13} /> : <Icon name="file" size={13} />} 导出可检索 PDF
                    </Btn>
                  )}
                  <Btn size="sm" className="bg-transparent! border border-white/25 text-paper! hover:border-white/60!" onClick={copyAll}>
                    <Icon name="code" size={13} /> 复制全文
                  </Btn>
                  <Btn size="sm" className="bg-transparent! border border-white/15 text-paper/70! hover:border-white/50!" onClick={() => app.openBook(book.id)}>
                    <Icon name="bookOpen" size={13} /> 带文字层阅读
                  </Btn>
                </div>
              </section>
            )}
          </div>

          {/* 右：识别结果 */}
          <section className="bg-card border border-line rounded-xl p-5 anim-fadeUp min-h-[320px]" style={{ animationDelay: "140ms" }}>
            <h3 className="font-display font-bold text-[15px] mb-4 flex items-center gap-2">
              <Icon name="text" size={15} className="text-verm" /> 识别结果
            </h3>
            {!book ? (
              <div className="flex flex-col items-center justify-center py-16 text-mist">
                <Icon name="scan" size={40} strokeWidth={1.2} className="mb-4 opacity-40" />
                <p className="text-sm">选择左侧的扫描版书籍开始识别</p>
                <p className="text-[11px] mt-1.5 opacity-70">支持中英混合 · 识别过程完全离线（首次需下载语言包）</p>
              </div>
            ) : recognized.length === 0 && !busy ? (
              <p className="text-xs text-mist leading-relaxed py-8">尚未识别任何页面。选择页码范围后点击「开始识别」；识别完成后再打开阅读器，扫描页上会覆盖一层透明可选的文字。</p>
            ) : (
              <ul className="space-y-3">
                {recognized.map((p) => {
                  const r = map[String(p)];
                  if (!r) return null;
                  return (
                    <li key={p} className="border border-line rounded-lg overflow-hidden group">
                      <div className="flex items-center gap-2 px-3.5 py-2 bg-paper/70">
                        <span className="text-[10px] font-black bg-moss/15 text-moss px-1.5 py-0.5 rounded">第 {p} 页</span>
                        <span className="text-[10px] text-mist tabular-nums">{r.words.length} 词组 · {r.text.length} 字</span>
                        <button
                          onClick={() => navigator.clipboard?.writeText(r.text).then(() => app.toast(`第 ${p} 页已复制`))}
                          className="ml-auto p-1 rounded text-mist hover:text-verm opacity-0 group-hover:opacity-100 transition-all cursor-pointer" title="复制本页"
                        >
                          <Icon name="code" size={13} />
                        </button>
                      </div>
                      <p className="text-xs leading-relaxed text-ink-soft px-3.5 py-3 whitespace-pre-wrap max-h-40 overflow-y-auto">{r.text.trim() || "（本页未识别到文字）"}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
