const PALETTES: Array<[string, string, string]> = [
  ["#1e3a31", "#0d1f17", "#c89b3c"],
  ["#7a2e1b", "#38130a", "#ecd9a8"],
  ["#24405f", "#0e1d30", "#d8b45a"],
  ["#54386b", "#221334", "#d9c08a"],
  ["#5f5320", "#2c240a", "#e8d9a8"],
  ["#2e5a52", "#0f2721", "#e0c078"],
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** 生成一张「书脊 + 竖排书名」风格的程序化封面 */
export async function makeCover(title: string, author: string, formatLabel: string): Promise<string> {
  try {
    if (document.fonts?.ready) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 800))]);
  } catch { /* ignore */ }

  const W = 360;
  const H = 504;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const [c1, c2, gold] = PALETTES[hashStr(title) % PALETTES.length];
  const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.globalAlpha = 0.05;
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = i % 2 ? "#ffffff" : "#000000";
    ctx.fillRect(Math.random() * W, Math.random() * H, 1, 1);
  }
  ctx.globalAlpha = 1;

  ctx.beginPath();
  ctx.arc(W * 0.72, H * 0.2, 46, 0, Math.PI * 2);
  ctx.fillStyle = gold;
  ctx.globalAlpha = 0.85;
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.strokeStyle = gold;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(18, 18, W - 36, H - 36);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(0, 0, 26, H);
  ctx.fillStyle = gold;
  ctx.globalAlpha = 0.7;
  ctx.fillRect(24, 0, 2, H);
  ctx.globalAlpha = 1;

  const chars = Array.from(title.replace(/\s+/g, "")).slice(0, 10);
  const fs = chars.length <= 5 ? 46 : chars.length <= 7 ? 40 : 32;
  const step = fs * 1.32;
  const totalH = chars.length * step;
  let y = Math.max(90, (H - totalH) / 2 + fs * 0.8);
  ctx.font = `700 ${fs}px "Noto Serif SC", "Songti SC", serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#f5efe0";
  const x = chars.length > 8 ? W * 0.5 : W * 0.55;
  for (const ch of chars) {
    ctx.fillText(ch, x, y);
    y += step;
  }

  ctx.font = `500 15px "Noto Sans SC", sans-serif`;
  ctx.fillStyle = "rgba(245,239,224,0.72)";
  ctx.fillText(author || "佚名", W * 0.55, H - 56);

  ctx.textAlign = "left";
  ctx.font = `700 11px "Noto Sans SC", sans-serif`;
  const label = formatLabel.toUpperCase();
  const tw = ctx.measureText(label).width + 16;
  ctx.fillStyle = gold;
  ctx.globalAlpha = 0.92;
  ctx.fillRect(40, 40, tw, 22);
  ctx.globalAlpha = 1;
  ctx.fillStyle = c2;
  ctx.fillText(label, 48, 55);

  return canvas.toDataURL("image/jpeg", 0.88);
}
