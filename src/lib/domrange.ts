/** 以「纯文本字符偏移」序列化/还原 DOM 选区 —— 批注持久化的核心 */

export interface TextNodeInfo {
  node: Text;
  start: number;
  end: number;
}

export function collectTextNodes(root: Node): TextNodeInfo[] {
  const list: TextNodeInfo[] = [];
  let offset = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const p = (n as Text).parentElement;
      if (!p) return NodeFilter.FILTER_REJECT;
      const tag = p.tagName;
      if (tag === "SCRIPT" || tag === "STYLE") return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n: Node | null = walker.nextNode();
  while (n) {
    const t = n as Text;
    const len = t.data.length;
    if (len > 0) {
      list.push({ node: t, start: offset, end: offset + len });
      offset += len;
    }
    n = walker.nextNode();
  }
  return list;
}

export function globalOffsetOf(root: Node, target: Node, targetOffset: number): number {
  if (target.nodeType === Node.TEXT_NODE) {
    const infos = collectTextNodes(root);
    for (const info of infos) {
      if (info.node === target) return info.start + Math.min(targetOffset, info.end - info.start);
    }
    return -1;
  }
  try {
    const r = document.createRange();
    r.selectNodeContents(root);
    r.setEnd(target, targetOffset);
    return r.toString().length;
  } catch {
    return -1;
  }
}

export function selectionToOffsets(
  root: HTMLElement,
): { start: number; end: number; text: string } | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  const start = globalOffsetOf(root, range.startContainer, range.startOffset);
  const end = globalOffsetOf(root, range.endContainer, range.endOffset);
  if (start < 0 || end < 0 || end <= start) return null;
  const text = sel.toString().replace(/\s+/g, " ").trim().slice(0, 160);
  if (!text) return null;
  return { start, end, text };
}

export function wrapRange(
  root: HTMLElement,
  start: number,
  end: number,
  makeEl: () => HTMLElement,
): void {
  const infos = collectTextNodes(root);
  const targets = infos.filter((i) => i.end > start && i.start < end);
  for (const info of targets) {
    let node: Text = info.node;
    const localStart = Math.max(0, start - info.start);
    const localEnd = Math.min(info.end - info.start, end - info.start);
    if (localEnd <= localStart || !node.parentNode) continue;
    const len = node.data.length;
    if (localEnd < len) node.splitText(localEnd);
    const mid = localStart > 0 ? node.splitText(localStart) : node;
    const el = makeEl();
    const parent = mid.parentNode;
    if (!parent) continue;
    parent.insertBefore(el, mid);
    el.appendChild(mid);
  }
}

export function unwrapAll(root: HTMLElement, selector: string): void {
  const nodes = Array.from(root.querySelectorAll(selector));
  for (const el of nodes) {
    const parent = el.parentNode;
    if (!parent) continue;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  }
  root.normalize();
}
