import React, { useEffect } from "react";
import { Icon } from "./icons";
import type { IconName } from "./icons";

/* ---------------- Spinner ---------------- */
export function Spinner({ size = 22, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={`animate-spin ${className}`} aria-label="加载中">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.6" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

/* ---------------- Button ---------------- */
type BtnVariant = "primary" | "dark" | "ghost" | "danger" | "gold";
export function Btn({
  variant = "primary", size = "md", className = "", children, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" | "lg" }) {
  const v: Record<BtnVariant, string> = {
    primary: "bg-verm text-[#fdf8f3] hover:bg-verm-deep shadow-[0_2px_10px_-2px_rgba(198,67,31,.5)]",
    dark: "bg-pine text-paper hover:bg-pine-2 shadow-[0_2px_10px_-2px_rgba(20,35,28,.5)]",
    ghost: "bg-card text-ink border border-line hover:border-ink/40 hover:bg-white",
    danger: "bg-transparent text-verm border border-verm/40 hover:bg-verm/10",
    gold: "bg-gold text-[#2c230c] hover:brightness-95 shadow-[0_2px_10px_-2px_rgba(200,155,60,.55)]",
  };
  const s = { sm: "px-2.5 py-1.5 text-xs", md: "px-4 py-2 text-sm", lg: "px-5 py-2.5 text-[15px]" };
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-all duration-150 active:scale-[0.96] disabled:opacity-40 disabled:pointer-events-none cursor-pointer ${v[variant]} ${s[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ---------------- Modal ---------------- */
export function Modal({
  open, onClose, title, children, width = 460,
}: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode; width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-pine/55 backdrop-blur-[2px] anim-fadeIn" onClick={onClose} />
      <div
        className="relative bg-card border border-line rounded-lg shadow-2xl anim-pop overflow-hidden"
        style={{ width: `min(${width}px, 94vw)` }}
        role="dialog" aria-modal="true"
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line bg-paper/60">
          <h3 className="font-display font-bold text-[17px] text-ink">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-md text-mist hover:text-ink hover:bg-line/50 transition-colors cursor-pointer" aria-label="关闭">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="p-5 max-h-[74vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

/* ---------------- EmptyState ---------------- */
export function EmptyState({
  icon = "bookOpen", title, desc, children,
}: {
  icon?: IconName;
  title: string; desc?: string; children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 anim-fadeUp">
      <div className="w-16 h-16 rounded-2xl bg-pine text-gold-soft flex items-center justify-center mb-5 rotate-3 shadow-lg anim-breathe">
        <Icon name={icon} size={30} strokeWidth={1.5} />
      </div>
      <h3 className="font-display font-black text-xl text-ink mb-1.5">{title}</h3>
      {desc && <p className="text-sm text-mist max-w-sm leading-relaxed mb-5">{desc}</p>}
      {children}
    </div>
  );
}

/* ---------------- 复选开关 ---------------- */
export function Toggle({
  checked, onChange, label, desc,
}: {
  checked: boolean; onChange: (v: boolean) => void; label: string; desc?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-lg border text-left transition-all duration-150 cursor-pointer ${
        checked ? "border-verm/50 bg-verm/[0.06]" : "border-line bg-card hover:border-ink/25"
      }`}
    >
      <span
        className={`w-[18px] h-[18px] rounded flex items-center justify-center border transition-colors shrink-0 ${
          checked ? "bg-verm border-verm text-white" : "border-ink/30 bg-white text-transparent"
        }`}
      >
        <Icon name="check" size={12} strokeWidth={3} />
      </span>
      <span className="min-w-0">
        <span className={`block text-sm font-medium ${checked ? "text-ink" : "text-ink-soft"}`}>{label}</span>
        {desc && <span className="block text-[11px] text-mist mt-0.5">{desc}</span>}
      </span>
    </button>
  );
}

/* ---------------- 进度条 ---------------- */
export function ProgressBar({ value, className = "", color = "var(--color-verm)" }: { value: number; className?: string; color?: string }) {
  return (
    <div className={`h-1.5 rounded-full bg-ink/10 overflow-hidden ${className}`}>
      <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${Math.round(value * 100)}%`, background: color }} />
    </div>
  );
}

/* ---------------- 视图标题 ---------------- */
export function ViewHeader({
  kicker, title, desc, right,
}: {
  kicker: string; title: string; desc?: string; right?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 flex-wrap mb-7">
      <div>
        <p className="text-[11px] font-bold tracking-[0.28em] text-verm uppercase mb-2">{kicker}</p>
        <h1 className="font-display font-black text-[34px] leading-tight text-ink">{title}</h1>
        {desc && <p className="text-sm text-mist mt-2 max-w-xl leading-relaxed">{desc}</p>}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}
