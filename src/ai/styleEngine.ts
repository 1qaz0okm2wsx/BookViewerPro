/** 自然语言排版引擎：把「正文改为思源宋体、行距 2.0、背景米黄」翻译为注入阅读器的 CSS */

export interface StyleResult {
  css: string;
  summary: string[];
}

export const STYLE_PRESETS: Array<{ label: string; prompt: string }> = [
  { label: "米黄书卷", prompt: "背景米黄色，正文思源宋体，字号18，行距2.0，首行缩进" },
  { label: "青瓷护眼", prompt: "背景豆沙绿护眼色，正文宋体，字号17，行距1.9" },
  { label: "夜读模式", prompt: "深色夜间背景，浅灰文字，字号18，行距1.9" },
  { label: "雪纸大字", prompt: "白色背景，正文黑体，字号22，行距2.1" },
  { label: "窄版楷體", prompt: "背景米白，正文楷体，字号17，行距1.85，窄版" },
];

const FONTS: Array<[RegExp, string, string]> = [
  [/宋体|serif|思源宋|noto\s*serif/i, '"Noto Serif SC","Songti SC","SimSun",serif', "思源宋体"],
  [/黑体|无衬线|sans|思源黑|noto\s*sans/i, '"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif', "思源黑体"],
  [/楷体|楷體|kai/i, '"KaiTi","STKaiti","Noto Serif SC",serif', "楷体"],
  [/等宽|mono|code/i, 'ui-monospace,"Cascadia Mono",Consolas,monospace', "等宽字体"],
];

const BGS: Array<[RegExp, string, string, string]> = [
  [/米黄|米色|羊皮|宣纸|米白/, "#f6eeda", "#3b3222", "米黄宣纸底"],
  [/护眼|豆沙|青瓷|淡绿/, "#e4ecdf", "#2c3a32", "豆沙绿护眼底"],
  [/夜间|夜读|深色|暗黑|黑色|暗色/, "#171b1e", "#c6cdce", "夜读深底"],
  [/纯?白|雪白|白色/, "#ffffff", "#262626", "纯白底"],
  [/灰(?!色文)|浅灰底/, "#efece6", "#2a2a2a", "浅灰纸底"],
];

export function styleFromPrompt(prompt: string): StyleResult {
  const rules: string[] = [];
  const summary: string[] = [];
  const p = prompt;

  for (const [re, css, name] of FONTS) {
    if (re.test(p)) {
      rules.push(`font-family: ${css}`);
      summary.push(`字体 → ${name}`);
      break;
    }
  }

  const sizeM = p.match(/(?:字号|字体大小|font-size|大小)[：:\s为是]*(\d{1,2})/) ?? p.match(/(\d{1,2})\s*(?:px|号字|号)/);
  if (sizeM) {
    const v = Math.min(32, Math.max(12, parseInt(sizeM[1], 10)));
    rules.push(`font-size: ${v}px`);
    summary.push(`字号 → ${v}px`);
  }

  const lhM = p.match(/(?:行距|行高|line-height)[：:\s为是]*([0-9]+(?:\.[0-9]+)?)/) ?? p.match(/([12]\.\d)\s*倍?行/);
  if (lhM) {
    const v = Math.min(3, Math.max(1, parseFloat(lhM[1])));
    rules.push(`line-height: ${v}`);
    summary.push(`行距 → ${v}`);
  }

  let bgDone = false;
  for (const [re, bg, fg, name] of BGS) {
    if (re.test(p)) {
      rules.push(`background: ${bg}`, `color: ${fg}`);
      summary.push(`底色 → ${name}`);
      bgDone = true;
      break;
    }
  }

  const colorM = p.match(/(?:文字|字体|字)颜色?[：:\s为是]*(深灰|浅灰|黑|棕|墨绿|藏青)/);
  if (colorM && !bgDone) {
    const map: Record<string, string> = { 深灰: "#3a3a3a", 浅灰: "#8a8a8a", 黑: "#1c1c1c", 棕: "#5a4632", 墨绿: "#24403a", 藏青: "#24344d" };
    rules.push(`color: ${map[colorM[1]]}`);
    summary.push(`文字颜色 → ${colorM[1]}`);
  }

  if (/宽版|宽屏|通栏/.test(p)) {
    rules.push("max-width: none");
    summary.push("版式 → 宽版通栏");
  } else if (/窄版|窄栏|收窄/.test(p)) {
    rules.push("max-width: 34em");
    summary.push("版式 → 窄版");
  }

  if (/首行缩进|段首缩进/.test(p)) {
    summary.push("段落 → 首行缩进两字");
    return finish(rules, summary, `p { text-indent: 2em; }`);
  }
  if (/取消缩进|不缩进|顶格/.test(p)) {
    summary.push("段落 → 顶格不缩进");
    return finish(rules, summary, `p { text-indent: 0; }`);
  }
  return finish(rules, summary, "");
}

function finish(rules: string[], summary: string[], extra: string): StyleResult {
  if (!rules.length && !extra) {
    return { css: "", summary: ["未识别到排版指令，试试：背景米黄、字号18、行距2.0、思源宋体…"] };
  }
  const css = [
    rules.length ? `.rv-doc { ${rules.join("; ")}; }` : "",
    extra ? `.rv-doc ${extra}` : "",
  ].filter(Boolean).join("\n");
  return { css, summary };
}
