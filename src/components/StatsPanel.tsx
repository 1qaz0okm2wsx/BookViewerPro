import React, { useEffect, useMemo, useState } from "react";
import { useApp } from "../store";
import { Icon } from "./icons";
import { Btn, ViewHeader } from "./ui";
import { fmtDuration, normKey, todayKey, SHORTCUT_LABEL, DEFAULT_KEYS } from "../types";
import type { ShortcutAction } from "../types";

const LEVELS = ["#eae6d8", "#cfe3cd", "#9cc7a4", "#5f9e78", "#2f6b4f"];
const level = (sec: number) => (sec <= 0 ? 0 : sec < 600 ? 1 : sec < 1800 ? 2 : sec < 3600 ? 3 : 4);

function keyLabel(k: string): string {
  const map: Record<string, string> = {
    arrowleft: "←", arrowright: "→", arrowup: "↑", arrowdown: "↓",
    " ": "Space", space: "Space", escape: "Esc",
  };
  return map[k] ?? (k.length === 1 ? k.toUpperCase() : k);
}

export default function StatsPanel() {
  const app = useApp();
  const [capturing, setCapturing] = useState<ShortcutAction | null>(null);

  const summary = useMemo(() => {
    const entries = Object.entries(app.stats);
    const totalSec = entries.reduce((s, [, v]) => s + v.seconds, 0);
    const totalPages = entries.reduce((s, [, v]) => s + v.pages, 0);
    const today = app.stats[todayKey()]?.seconds ?? 0;
    let week = 0;
    for (let i = 0; i < 7; i++) week += app.stats[todayKey(-i)]?.seconds ?? 0;
    let streak = 0;
    for (let i = 0; i < 3650; i++) {
      const s = app.stats[todayKey(-i)]?.seconds ?? 0;
      if (s > 0) streak++;
      else if (i === 0) continue;
      else break;
    }
    return { totalSec, totalPages, activeDays: entries.filter(([, v]) => v.seconds > 0).length, today, week, streak };
  }, [app.stats]);

  /* 近 26 周，列 = 周（周一起始） */
  const weeks = useMemo(() => {
    const total = 26 * 7;
    const first = new Date();
    first.setDate(first.getDate() - (total - 1));
    const pad = (first.getDay() + 6) % 7;
    const cells: Array<{ key: string; sec: number; label: string } | null> = [];
    for (let i = 0; i < pad; i++) cells.push(null);
    for (let i = total - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      cells.push({ key, sec: app.stats[key]?.seconds ?? 0, label: `${d.getMonth() + 1} 月 ${d.getDate()} 日` });
    }
    const cols: Array<Array<(typeof cells)[number]>> = [];
    for (let i = 0; i < cells.length; i += 7) cols.push(cells.slice(i, i + 7));
    return cols;
  }, [app.stats]);

  const last7 = useMemo(() => {
    const out: Array<{ label: string; sec: number; pages: number; isToday: boolean }> = [];
    const names = ["日", "一", "二", "三", "四", "五", "六"];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = todayKey(-i);
      out.push({ label: i === 0 ? "今天" : `周${names[d.getDay()]}`, sec: app.stats[key]?.seconds ?? 0, pages: app.stats[key]?.pages ?? 0, isToday: i === 0 });
    }
    return out;
  }, [app.stats]);

  /* 快捷键录入 */
  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") { setCapturing(null); return; }
      const k = normKey(e);
      const used = (Object.entries(app.keybindings) as Array<[ShortcutAction, string]>).find(([a, key]) => key === k && a !== capturing);
      if (used) {
        app.toast(`「${keyLabel(k)}」已被「${SHORTCUT_LABEL[used[0]]}」占用，请换一个键`, "error");
        return;
      }
      app.setKeybinding(capturing, k);
      app.toast(`「${SHORTCUT_LABEL[capturing]}」已绑定到 ${keyLabel(k)}`);
      setCapturing(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturing]);

  const maxWeek = Math.max(1, ...last7.map((d) => d.sec));
  const maxDay = Math.max(...weeks.flat().map((c) => c?.sec ?? 0), 1);
  const bestDay = weeks.flat().reduce<{ label: string; sec: number } | null>((best, c) => {
    if (!c || c.sec <= 0) return best;
    return !best || c.sec > best.sec ? { label: c.label, sec: c.sec } : best;
  }, null);

  const cards: Array<{ icon: React.ComponentProps<typeof Icon>["name"]; label: string; value: string; tone: string }> = [
    { icon: "clock", label: "今日阅读", value: fmtDuration(summary.today), tone: "#c6431f" },
    { icon: "leaf", label: "本周阅读", value: fmtDuration(summary.week), tone: "#3f6b52" },
    { icon: "bookOpen", label: "累计时长", value: fmtDuration(summary.totalSec), tone: "#24405f" },
    { icon: "rows", label: "累计翻页", value: `${summary.totalPages.toLocaleString()} 页`, tone: "#8a5aa8" },
    { icon: "chart", label: "活跃天数", value: `${summary.activeDays} 天`, tone: "#c07a26" },
    { icon: "spark", label: "连续打卡", value: `${summary.streak} 天`, tone: "#c89b3c" },
  ];

  return (
    <div className="h-full overflow-y-auto app-bg">
      <div className="max-w-5xl mx-auto px-8 py-10">
        <ViewHeader
          kicker="Rhythm · 统计"
          title="阅读统计"
          desc="阅读时长与翻页在后台静默记录。热力图按周铺展，像年轮一样留下你的读书痕迹。"
          right={
            summary.totalSec > 0 ? (
              <Btn variant="danger" size="sm" onClick={() => { if (window.confirm("确定清空全部阅读统计吗？此操作不可撤销。")) { app.clearStats(); app.toast("统计已清空", "info"); } }}>
                <Icon name="trash" size={13} /> 清空统计
              </Btn>
            ) : undefined
          }
        />

        {/* 概览卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
          {cards.map((c, i) => (
            <div key={c.label} className="bg-card border border-line rounded-xl p-4 hover-lift anim-fadeUp" style={{ animationDelay: `${i * 50}ms` }}>
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg mb-2.5" style={{ background: `${c.tone}18`, color: c.tone }}>
                <Icon name={c.icon} size={16} />
              </span>
              <p className="font-display font-black text-[19px] leading-tight tabular-nums">{c.value}</p>
              <p className="text-[11px] text-mist mt-0.5">{c.label}</p>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
          {/* 热力图 */}
          <section className="bg-card border border-line rounded-xl p-6 anim-fadeUp" style={{ animationDelay: "120ms" }}>
            <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
              <h3 className="font-display font-bold text-[17px] flex items-center gap-2"><Icon name="chart" size={17} className="text-moss" /> 阅读热力图 <span className="text-[11px] text-mist font-body font-normal">近 26 周</span></h3>
              <div className="flex items-center gap-1.5 text-[10px] text-mist">
                少
                {LEVELS.map((l) => <span key={l} className="w-2.5 h-2.5 rounded-[2px] inline-block" style={{ background: l }} />)}
                多
              </div>
            </div>
            <div className="overflow-x-auto pb-1">
              <div className="flex gap-[3px] min-w-max">
                <div className="flex flex-col gap-[3px] mr-1.5 text-[9px] text-mist leading-[11px]">
                  {["一", "", "三", "", "五", "", "日"].map((d, i) => <span key={i} className="h-[11px]">{d}</span>)}
                </div>
                {weeks.map((col, ci) => (
                  <div key={ci} className="flex flex-col gap-[3px]">
                    {col.map((cell, ri) =>
                      cell ? (
                        <div
                          key={cell.key}
                          title={`${cell.label} · 阅读 ${fmtDuration(cell.sec)} · 翻 ${app.stats[cell.key]?.pages ?? 0} 页`}
                          className="w-[11px] h-[11px] rounded-[2px] transition-transform hover:scale-125 hover:ring-1 hover:ring-verm cursor-default"
                          style={{ background: LEVELS[level(cell.sec)], boxShadow: cell.sec >= maxDay && cell.sec > 0 ? "0 0 0 1px #c6431f55" : undefined }}
                        />
                      ) : (
                        <div key={`p${ri}`} className="w-[11px] h-[11px]" />
                      ),
                    )}
                  </div>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-mist mt-3">
              {bestDay ? <>最投入的一天是 <strong className="text-ink">{bestDay.label}</strong>，读了 {fmtDuration(bestDay.sec)}。</> : "开始阅读后，这里会长出第一片绿。"}
            </p>
          </section>

          <div className="space-y-6">
            {/* 近 7 日 */}
            <section className="bg-card border border-line rounded-xl p-5 anim-fadeUp" style={{ animationDelay: "180ms" }}>
              <h3 className="font-display font-bold text-[15px] mb-4 flex items-center gap-2"><Icon name="clock" size={15} className="text-verm" /> 近 7 日</h3>
              <div className="flex items-end justify-between gap-1.5 h-28">
                {last7.map((d) => (
                  <div key={d.label} className="flex-1 flex flex-col items-center gap-1.5 group cursor-default" title={`${d.label} · ${fmtDuration(d.sec)} · ${d.pages} 页`}>
                    <div className="w-full rounded-t-[3px] transition-all duration-500 group-hover:brightness-110" style={{ height: `${Math.max(3, (d.sec / maxWeek) * 88)}px`, background: d.isToday ? "#c6431f" : d.sec ? "#3f6b52" : "#e4dfd2" }} />
                    <span className={`text-[9px] ${d.isToday ? "text-verm font-bold" : "text-mist"}`}>{d.label}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* 快捷键 */}
            <section className="bg-card border border-line rounded-xl p-5 anim-fadeUp" style={{ animationDelay: "240ms" }}>
              <h3 className="font-display font-bold text-[15px] mb-1 flex items-center gap-2"><Icon name="keyboard" size={15} className="text-moss" /> 快捷键映射</h3>
              <p className="text-[11px] text-mist mb-3.5">点击「重绑」后按下新键即可；Esc 取消。在阅读页即时生效。</p>
              <ul className="space-y-1.5">
                {(Object.keys(SHORTCUT_LABEL) as ShortcutAction[]).map((a) => (
                  <li key={a} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md hover:bg-paper transition-colors">
                    <span className="text-xs text-ink-soft">{SHORTCUT_LABEL[a]}</span>
                    <span className="flex items-center gap-1.5">
                      <kbd className={`bv-kbd text-ink! border-line! bg-paper px-2 py-1 min-w-[30px] text-center ${capturing === a ? "border-verm! text-verm animate-pulse" : ""}`}>
                        {capturing === a ? "按键…" : keyLabel(app.keybindings[a])}
                      </kbd>
                      <button
                        onClick={() => setCapturing(capturing === a ? null : a)}
                        className={`text-[10px] px-2 py-1 rounded border transition-all cursor-pointer ${capturing === a ? "border-verm text-verm" : "border-line text-mist hover:text-ink hover:border-ink/40"}`}
                      >
                        {capturing === a ? "取消" : "重绑"}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => { app.resetKeybindings(); app.toast("已恢复默认快捷键", "info"); }}
                className="mt-3 text-[11px] text-mist hover:text-verm transition-colors cursor-pointer flex items-center gap-1"
              >
                <Icon name="undo" size={11} /> 恢复默认
              </button>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
