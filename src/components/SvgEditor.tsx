import React, { useRef, useState } from "react";
import { saveAs } from "file-saver";
import { useApp } from "../store";
import { Icon } from "./icons";
import type { IconName } from "./icons";
import { Btn } from "./ui";
import { uid } from "../types";

type Tool = "select" | "rect" | "ellipse" | "line" | "path" | "text";
type ElType = "rect" | "ellipse" | "line" | "path" | "text";

interface SvgEl {
  id: string;
  type: ElType;
  x1: number; y1: number; x2: number; y2: number;
  d?: string;
  text?: string;
  fontSize?: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
}

const W = 960;
const H = 600;

const TOOLS: Array<{ key: Tool; icon: IconName; label: string }> = [
  { key: "select", icon: "select", label: "选择 / 移动" },
  { key: "rect", icon: "square", label: "矩形" },
  { key: "ellipse", icon: "circle", label: "椭圆" },
  { key: "line", icon: "line", label: "直线" },
  { key: "path", icon: "pencil", label: "自由画笔" },
  { key: "text", icon: "text", label: "文字（双击修改）" },
];

function serializeEl(el: SvgEl): string {
  const paint = `fill="${el.type === "line" || el.type === "path" ? "none" : el.fill}" stroke="${el.stroke}" stroke-width="${el.strokeWidth}" opacity="${el.opacity}"`;
  switch (el.type) {
    case "rect": {
      const x = Math.min(el.x1, el.x2), y = Math.min(el.y1, el.y2);
      return `<rect x="${x}" y="${y}" width="${Math.abs(el.x2 - el.x1)}" height="${Math.abs(el.y2 - el.y1)}" rx="2" ${paint}/>`;
    }
    case "ellipse":
      return `<ellipse cx="${(el.x1 + el.x2) / 2}" cy="${(el.y1 + el.y2) / 2}" rx="${Math.abs(el.x2 - el.x1) / 2}" ry="${Math.abs(el.y2 - el.y1) / 2}" ${paint}/>`;
    case "line":
      return `<line x1="${el.x1}" y1="${el.y1}" x2="${el.x2}" y2="${el.y2}" ${paint} stroke-linecap="round"/>`;
    case "path":
      return `<path d="${el.d ?? ""}" ${paint} stroke-linecap="round" stroke-linejoin="round"/>`;
    case "text":
      return `<text x="${el.x1}" y="${el.y1}" font-size="${el.fontSize ?? 28}" font-family="'Noto Serif SC',serif" fill="${el.fill}" stroke="none" opacity="${el.opacity}">${(el.text ?? "").replace(/</g, "&lt;")}</text>`;
  }
}

export default function SvgEditor({ initial, title }: { initial?: string; title?: string }) {
  const app = useApp();
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [els, setEls] = useState<SvgEl[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("rect");
  const [fill, setFill] = useState("#3f6b52");
  const [stroke, setStroke] = useState("#232b28");
  const [sw, setSw] = useState(2.5);
  const [showGrid, setShowGrid] = useState(true);
  const [darkBg, setDarkBg] = useState(false);
  const [textEdit, setTextEdit] = useState<{ id: string; x: number; y: number; val: string } | null>(null);
  const [histLen, setHistLen] = useState(0);
  const history = useRef<string[]>([]);
  const drawing = useRef<{ id: string } | null>(null);
  const moving = useRef<{ sx: number; sy: number; orig: Map<string, { x1: number; y1: number; x2: number; y2: number; d?: string }> } | null>(null);

  const initialInner = initial
    ? initial.replace(/<\?xml[^>]*>/g, "").replace(/<svg[^>]*>/i, "").replace(/<\/svg>/i, "").trim()
    : "";

  const pushHistory = (snapshot: SvgEl[]) => {
    history.current.push(JSON.stringify(snapshot));
    if (history.current.length > 60) history.current.shift();
    setHistLen(history.current.length);
  };
  const undo = () => {
    const last = history.current.pop();
    setHistLen(history.current.length);
    if (last) { setEls(JSON.parse(last)); setSelId(null); }
  };

  const toPoint = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };

  const onDown = (e: React.PointerEvent) => {
    if (tool === "select") { setSelId(null); return; }
    const p = toPoint(e);
    if (tool === "text") {
      pushHistory(els);
      const el: SvgEl = { id: uid(), type: "text", x1: p.x, y1: p.y, x2: p.x, y2: p.y, text: "双击编辑文字", fontSize: 28, fill, stroke, strokeWidth: sw, opacity: 1 };
      setEls((prev) => [...prev, el]);
      setSelId(el.id);
      setTool("select");
      return;
    }
    const el: SvgEl = {
      id: uid(), type: tool as ElType, x1: p.x, y1: p.y, x2: p.x, y2: p.y,
      fill, stroke, strokeWidth: sw, opacity: 1,
      d: tool === "path" ? `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}` : undefined,
    };
    pushHistory(els);
    drawing.current = { id: el.id };
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setEls((prev) => [...prev, el]);
    setSelId(el.id);
  };

  const onMove = (e: React.PointerEvent) => {
    const p = toPoint(e);
    if (drawing.current) {
      const id = drawing.current.id;
      setEls((prev) => prev.map((el) => {
        if (el.id !== id) return el;
        if (el.type === "path") return { ...el, d: `${el.d} L ${p.x.toFixed(1)} ${p.y.toFixed(1)}` };
        return { ...el, x2: p.x, y2: p.y };
      }));
    } else if (moving.current) {
      const m = moving.current;
      const dx = p.x - m.sx, dy = p.y - m.sy;
      setEls((prev) => prev.map((el) => {
        const o = m.orig.get(el.id);
        if (!o) return el;
        if (el.type === "path" && o.d) {
          return {
            ...el,
            d: o.d.replace(/(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/g, (_: string, a: string, b: string) =>
              `${(parseFloat(a) + dx).toFixed(1)} ${(parseFloat(b) + dy).toFixed(1)}`),
          };
        }
        return { ...el, x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy };
      }));
    }
  };

  const onUp = () => {
    if (drawing.current) {
      const id = drawing.current.id;
      drawing.current = null;
      setEls((prev) => {
        const target = prev.find((x) => x.id === id);
        if (target && target.type !== "path" && target.type !== "text" && Math.abs(target.x2 - target.x1) < 4 && Math.abs(target.y2 - target.y1) < 4) {
          return prev.filter((x) => x.id !== id);
        }
        return prev;
      });
      setTool("select");
    }
    if (moving.current) moving.current = null;
  };

  const startMove = (e: React.PointerEvent, id: string) => {
    if (tool !== "select") return;
    e.stopPropagation();
    const p = toPoint(e);
    setSelId(id);
    pushHistory(els);
    const orig = new Map<string, { x1: number; y1: number; x2: number; y2: number; d?: string }>();
    els.forEach((el) => orig.set(el.id, { x1: el.x1, y1: el.y1, x2: el.x2, y2: el.y2, d: el.d }));
    moving.current = { sx: p.x, sy: p.y, orig };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const selected = els.find((e) => e.id === selId) ?? null;

  const patchSelected = (patch: Partial<SvgEl>) => {
    if (!selId) return;
    setEls((prev) => prev.map((el) => (el.id === selId ? { ...el, ...patch } : el)));
  };

  const toSvgString = () => {
    const bg = darkBg ? "#171b1e" : "#ffffff";
    const base = initialInner ? `  <g>${initialInner}</g>\n` : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="${bg}"/>
${base}${els.map((el) => `  ${serializeEl(el)}`).join("\n")}
</svg>`;
  };

  const exportSvg = () => {
    const name = `${title || "墨阁画稿"}.svg`;
    saveAs(new Blob([toSvgString()], { type: "image/svg+xml;charset=utf-8" }), name);
    app.toast(`已导出 ${name}`);
  };

  const editText = (el: SvgEl, e: React.MouseEvent) => {
    e.stopPropagation();
    const r = wrapRef.current!.getBoundingClientRect();
    const er = (e.target as Element).getBoundingClientRect();
    setTextEdit({ id: el.id, x: er.left - r.left, y: er.bottom - r.top + 6, val: el.text ?? "" });
  };

  return (
    <div className="h-full flex flex-col bg-card border border-line rounded-xl overflow-hidden anim-fadeIn">
      <div className="flex items-center gap-1 px-3 py-2 border-b border-line bg-paper/70 flex-wrap">
        {TOOLS.map((t) => (
          <button
            key={t.key} onClick={() => setTool(t.key)} title={t.label}
            className={`p-2 rounded-md transition-all cursor-pointer ${tool === t.key ? "bg-verm text-white shadow" : "text-ink-soft hover:bg-line/70"}`}
          >
            <Icon name={t.icon} size={15} />
          </button>
        ))}
        <span className="w-px bg-line mx-1.5 self-center" style={{ height: 20 }} />
        <label className="flex items-center gap-1.5 text-[11px] text-mist cursor-pointer">
          填充
          <input type="color" value={fill} onChange={(e) => { setFill(e.target.value); if (selected) patchSelected({ fill: e.target.value }); }} className="w-7 h-7 rounded border border-line cursor-pointer bg-transparent" />
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-mist cursor-pointer">
          描边
          <input type="color" value={stroke} onChange={(e) => { setStroke(e.target.value); if (selected) patchSelected({ stroke: e.target.value }); }} className="w-7 h-7 rounded border border-line cursor-pointer bg-transparent" />
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-mist">
          线宽
          <input type="range" min={0.5} max={14} step={0.5} value={sw} onChange={(e) => { setSw(+e.target.value); if (selected) patchSelected({ strokeWidth: +e.target.value }); }} className="bv-range w-20" />
          <span className="tabular-nums w-6">{sw}</span>
        </label>
        <span className="w-px bg-line mx-1.5 self-center" style={{ height: 20 }} />
        <button onClick={() => setShowGrid((v) => !v)} title="网格" className={`p-2 rounded-md cursor-pointer transition-colors ${showGrid ? "text-verm bg-verm/10" : "text-ink-soft hover:bg-line/70"}`}><Icon name="grid" size={15} /></button>
        <button onClick={() => setDarkBg((v) => !v)} title="深色画布" className={`p-2 rounded-md cursor-pointer transition-colors ${darkBg ? "text-verm bg-verm/10" : "text-ink-soft hover:bg-line/70"}`}><Icon name="moon" size={15} /></button>
        <button onClick={undo} disabled={histLen === 0} title="撤销" className="p-2 rounded-md text-ink-soft hover:bg-line/70 disabled:opacity-30 cursor-pointer transition-colors"><Icon name="undo" size={15} /></button>
        <button
          onClick={() => { if (els.length) { pushHistory(els); setEls([]); setSelId(null); } }}
          disabled={!els.length} title="清空画布"
          className="p-2 rounded-md text-ink-soft hover:bg-line/70 hover:text-verm disabled:opacity-30 cursor-pointer transition-colors"
        >
          <Icon name="trash" size={15} />
        </button>

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {selected && (
            <>
              <button onClick={() => { pushHistory(els); setEls((prev) => [...prev.filter((x) => x.id !== selId), selected]); }} className="p-2 rounded-md text-ink-soft hover:bg-line/70 cursor-pointer" title="置于顶层"><Icon name="chevD" size={15} className="rotate-180" /></button>
              <button onClick={() => { pushHistory(els); setEls((prev) => [selected, ...prev.filter((x) => x.id !== selId)]); }} className="p-2 rounded-md text-ink-soft hover:bg-line/70 cursor-pointer" title="置于底层"><Icon name="chevD" size={15} /></button>
              <button onClick={() => { pushHistory(els); const copy = { ...selected, id: uid(), x1: selected.x1 + 18, y1: selected.y1 + 18, x2: selected.x2 + 18, y2: selected.y2 + 18 }; setEls((prev) => [...prev, copy]); setSelId(copy.id); }} className="p-2 rounded-md text-ink-soft hover:bg-line/70 cursor-pointer" title="复制"><Icon name="plus" size={15} /></button>
              <button onClick={() => { pushHistory(els); setEls((prev) => prev.filter((x) => x.id !== selId)); setSelId(null); }} className="p-2 rounded-md text-verm hover:bg-verm/10 cursor-pointer" title="删除"><Icon name="trash" size={15} /></button>
              <span className="w-px bg-line self-center" style={{ height: 20 }} />
            </>
          )}
          <Btn size="sm" variant="ghost" onClick={() => { navigator.clipboard?.writeText(toSvgString()).then(() => app.toast("SVG 代码已复制")).catch(() => app.toast("复制失败", "error")); }}>
            <Icon name="code" size={13} /> 复制代码
          </Btn>
          <Btn size="sm" onClick={exportSvg}><Icon name="download" size={13} /> 导出 SVG</Btn>
          <Btn size="sm" variant="dark" onClick={() => app.addFiles([new File([toSvgString()], `${title || "墨阁画稿"}.svg`, { type: "image/svg+xml" })])}>
            <Icon name="save" size={13} /> 存回书架
          </Btn>
        </div>
      </div>

      <div ref={wrapRef} className="flex-1 min-h-0 overflow-auto flex items-center justify-center p-6" style={{ background: "repeating-conic-gradient(rgba(35,43,40,0.045) 0% 25%, transparent 0% 50%) 0 0/22px 22px" }}>
        <div className="relative w-full max-w-[860px]">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className={`w-full border border-line rounded-md shadow-[0_10px_36px_-12px_rgba(20,35,28,0.35)] touch-none ${tool !== "select" ? "cursor-crosshair" : ""}`}
            style={{ background: darkBg ? "#171b1e" : "#ffffff" }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
          >
            {showGrid && (
              <g stroke={darkBg ? "rgba(255,255,255,0.06)" : "rgba(35,43,40,0.07)"} strokeWidth="1">
                {Array.from({ length: 11 }, (_, i) => <line key={`v${i}`} x1={(i + 1) * 80} y1={0} x2={(i + 1) * 80} y2={H} />)}
                {Array.from({ length: 7 }, (_, i) => <line key={`h${i}`} x1={0} y1={(i + 1) * 75} x2={W} y2={(i + 1) * 75} />)}
              </g>
            )}
            {initialInner && <g dangerouslySetInnerHTML={{ __html: initialInner }} />}
            {els.map((el) => {
              const common = {
                onPointerDown: (e: React.PointerEvent) => startMove(e, el.id),
                onDoubleClick: el.type === "text" ? (e: React.MouseEvent) => editText(el, e) : undefined,
                style: { cursor: tool === "select" ? "move" : undefined, filter: el.id === selId ? "drop-shadow(0 0 3px rgba(198,67,31,0.9))" : undefined } as React.CSSProperties,
              };
              switch (el.type) {
                case "rect": {
                  const x = Math.min(el.x1, el.x2), y = Math.min(el.y1, el.y2);
                  return <rect key={el.id} x={x} y={y} width={Math.abs(el.x2 - el.x1)} height={Math.abs(el.y2 - el.y1)} rx={2} fill={el.fill} stroke={el.stroke} strokeWidth={el.strokeWidth} opacity={el.opacity} {...common} />;
                }
                case "ellipse":
                  return <ellipse key={el.id} cx={(el.x1 + el.x2) / 2} cy={(el.y1 + el.y2) / 2} rx={Math.abs(el.x2 - el.x1) / 2} ry={Math.abs(el.y2 - el.y1) / 2} fill={el.fill} stroke={el.stroke} strokeWidth={el.strokeWidth} opacity={el.opacity} {...common} />;
                case "line":
                  return <line key={el.id} x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} stroke={el.stroke} strokeWidth={el.strokeWidth} opacity={el.opacity} strokeLinecap="round" {...common} />;
                case "path":
                  return <path key={el.id} d={el.d} fill="none" stroke={el.stroke} strokeWidth={el.strokeWidth} opacity={el.opacity} strokeLinecap="round" strokeLinejoin="round" {...common} />;
                case "text":
                  return <text key={el.id} x={el.x1} y={el.y1} fontSize={el.fontSize} fontFamily="'Noto Serif SC',serif" fill={el.fill} opacity={el.opacity} {...common}>{el.text}</text>;
              }
            })}
          </svg>

          {textEdit && (
            <div className="absolute z-30 anim-pop" style={{ left: textEdit.x, top: textEdit.y }}>
              <input
                autoFocus value={textEdit.val}
                onChange={(e) => setTextEdit({ ...textEdit, val: e.target.value })}
                onBlur={() => { const v = textEdit.val; const id = textEdit.id; setEls((prev) => prev.map((el) => (el.id === id ? { ...el, text: v || "文字" } : el))); setTextEdit(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setTextEdit(null); }}
                className="bg-pine text-paper text-sm px-3 py-1.5 rounded-md border border-white/20 outline-none shadow-xl w-56"
              />
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 px-4 py-2 border-t border-line bg-paper/70 text-[11px] text-mist">
        <Icon name="info" size={13} />
        <span>{els.length} 个图形{initialInner ? " · 已载入原 SVG 底稿" : ""} · 画布 {W}×{H} · 历史 {histLen} 步</span>
        <span className="ml-auto">
          {tool === "select" ? "点击图形选中，拖动可移动；双击文字可修改" : `正在使用「${TOOLS.find((t) => t.key === tool)?.label}」工具，在画布上拖动绘制`}
        </span>
      </div>
    </div>
  );
}
