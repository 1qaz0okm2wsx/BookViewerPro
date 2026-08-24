import type { Annotation } from "../types";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const TYPE_LABEL: Record<Annotation["type"], string> = {
  highlight: "高亮", underline: "下划线", strike: "删除线", comment: "批注",
};

interface TreeNode {
  name: string;
  children: TreeNode[];
}

function buildTree(title: string, notes: Annotation[]): TreeNode {
  const byChapter = new Map<string, Annotation[]>();
  notes.forEach((n) => {
    const arr = byChapter.get(n.chapterTitle) ?? [];
    arr.push(n);
    byChapter.set(n.chapterTitle, arr);
  });
  const children: TreeNode[] = [];
  byChapter.forEach((list, ch) => {
    children.push({
      name: ch,
      children: list.map((n) => ({
        name: `「${n.text.slice(0, 60)}${n.text.length > 60 ? "…" : ""}」`,
        children: [
          { name: `类型：${TYPE_LABEL[n.type]}`, children: [] },
          ...(n.note ? [{ name: `批注：${n.note}`, children: [] }] : []),
        ],
      })),
    });
  });
  return { name: title, children };
}

/** 生成 OPML（可导入 XMind / 幕布 / markmap / Logseq） */
export function notesToOpml(title: string, notes: Annotation[]): string {
  const tree = buildTree(title, notes);
  const render = (n: TreeNode, depth: number): string => {
    const pad = "  ".repeat(depth + 2);
    if (!n.children.length) return `${pad}<outline text="${esc(n.name)}"/>\n`;
    return (
      `${pad}<outline text="${esc(n.name)}">\n` +
      n.children.map((c) => render(c, depth + 1)).join("") +
      `${pad}</outline>\n`
    );
  };
  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>${esc(title)}</title>
    <dateCreated>${new Date().toUTCString()}</dateCreated>
    <docs>由墨阁 BookViewer Pro 读书笔记生成</docs>
  </head>
  <body>
${render(tree, 0)}  </body>
</opml>`;
}

/** 生成完全离线、自包含的可交互思维导图 HTML（内联 SVG 树状布局，无外部依赖） */
export function notesToMindmapHtml(title: string, notes: Annotation[]): string {
  const tree = buildTree(title, notes);
  const json = JSON.stringify(tree)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e");
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(title)} · 思维导图</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;font-family:"Noto Serif SC","Songti SC","SimSun",serif;background:#101d16;color:#e9e4d4;height:100vh;display:flex;flex-direction:column;overflow:hidden}
  header{padding:14px 22px;border-bottom:1px solid rgba(255,255,255,.08);display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}
  header h1{font-size:19px;margin:0;letter-spacing:.06em;color:#ecd9a8}
  header p{font-size:12px;color:rgba(233,228,212,.45);margin:0}
  header .tools{margin-left:auto;display:flex;gap:8px}
  header button{background:rgba(255,255,255,.08);color:#e9e4d4;border:1px solid rgba(255,255,255,.14);border-radius:6px;padding:5px 12px;font-size:12px;cursor:pointer;font-family:inherit}
  header button:hover{background:rgba(200,155,60,.25)}
  #view{flex:1;overflow:auto;cursor:grab}
  svg{display:block}
  .link{fill:none;stroke:rgba(200,155,60,.35);stroke-width:1.4}
  .node rect{fill:#1c3128;stroke:rgba(200,155,60,.4);rx:7}
  .node.root rect{fill:#c6431f;stroke:#c6431f}
  .node text{fill:#e9e4d4;font-size:13px;font-family:"Noto Sans SC",sans-serif;dominant-baseline:middle}
  .node.root text{fill:#fff;font-weight:700;font-size:14px}
  .node{cursor:pointer}
  .node.collapsed rect{stroke-dasharray:4 3}
  footer{padding:8px 22px;font-size:11px;color:rgba(233,228,212,.35);border-top:1px solid rgba(255,255,255,.06)}
</style>
</head>
<body>
<header>
  <h1>《${esc(title)}》读书笔记 · 思维导图</h1>
  <p>${notes.length} 条批注 · 点击节点折叠/展开 · 墨阁 BookViewer Pro 生成</p>
  <div class="tools">
    <button onclick="expandAll(true)">全部展开</button>
    <button onclick="expandAll(false)">收起到章</button>
  </div>
</header>
<div id="view"></div>
<footer>此文件完全离线自包含，可随 ZIP 导出包分发；OPML 版本另见 annotations.opml（可导入 XMind / markmap）。</footer>
<script>
const DATA = ${json};
const collapsed = new Set();
let idc = 0;
function flatten(node, depth, out, parent) {
  const id = node.__id ?? (node.__id = ++idc);
  const item = { id, name: node.name, depth, children: [], hidden: false, parent };
  out.push(item);
  if (!collapsed.has(id)) {
    for (const c of node.children || []) flatten(c, depth + 1, out, item);
  }
  return item;
}
function layout() {
  const nodes = [];
  flatten(DATA, 0, nodes, null);
  // 简单纵向树布局：叶子按出现顺序排 Y，父节点取子节点中点
  const ROW = 30, INDENT = 220, PADX = 40, PADY = 30;
  let y = PADY;
  const pos = new Map();
  function walk(item) {
    const kids = nodes.filter(n => n.parent === item);
    if (!kids.length) { pos.set(item.id, { x: PADX + item.depth * INDENT, y }); y += ROW; }
    else {
      kids.forEach(walk);
      const ys = kids.map(k => pos.get(k.id).y);
      pos.set(item.id, { x: PADX + item.depth * INDENT, y: (Math.min(...ys) + Math.max(...ys)) / 2 });
    }
  }
  walk(nodes[0]);
  const W = PADX * 2 + 4 * INDENT + 260, H = y + PADY;
  let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '">';
  for (const n of nodes) {
    if (!n.parent) continue;
    const a = pos.get(n.parent.id), b = pos.get(n.id);
    const mx = (a.x + 190 + b.x) / 2;
    svg += '<path class="link" d="M' + (a.x + 190) + ' ' + a.y + ' C ' + mx + ' ' + a.y + ', ' + mx + ' ' + b.y + ', ' + b.x + ' ' + b.y + '"/>';
  }
  for (const n of nodes) {
    const p = pos.get(n.id);
    const label = n.name.length > 26 ? n.name.slice(0, 26) + '…' : n.name;
    const kids = nodes.filter(x => x.parent === n);
    const hasKids = (findNode(n.id).children || []).length > 0;
    const cls = 'node' + (n.depth === 0 ? ' root' : '') + (hasKids && collapsed.has(n.id) ? ' collapsed' : '');
    svg += '<g class="' + cls + '" transform="translate(' + p.x + ',' + p.y + ')" onclick="toggle(' + n.id + ')">'
      + '<rect x="0" y="-13" width="190" height="26" rx="7"></rect>'
      + '<text x="12" y="1">' + label.replace(/&/g,'&amp;').replace(/</g,'&lt;') + (hasKids ? '  (' + (collapsed.has(n.id) ? '+' + countDesc(n.id) : kids.length) + ')' : '') + '</text></g>';
  }
  svg += '</svg>';
  document.getElementById('view').innerHTML = svg;
}
function findNode(id) {
  const stack = [DATA];
  while (stack.length) {
    const n = stack.pop();
    if (n.__id === id) return n;
    (n.children || []).forEach(c => stack.push(c));
  }
  return { children: [] };
}
function countDesc(id) {
  let c = 0; const stack = [...(findNode(id).children || [])];
  while (stack.length) { c++; const n = stack.pop(); (n.children || []).forEach(x => stack.push(x)); }
  return c;
}
function toggle(id) { collapsed.has(id) ? collapsed.delete(id) : collapsed.add(id); layout(); }
function expandAll(open) {
  if (open) collapsed.clear();
  else {
    collapsed.clear();
    (DATA.children || []).forEach(ch => collapsed.add(ch.__id ?? (ch.__id = ++idc0())));
  }
  layout();
}
let __c = 100000; function idc0() { return ++__c; }
// 先分配 id 保证 expandAll 可用
(function assign(n){ n.__id = n.__id || ++__c; (n.children||[]).forEach(assign); })(DATA);
layout();
</script>
</body>
</html>`;
}
