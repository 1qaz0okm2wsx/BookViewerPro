import * as pdfjs from "pdfjs-dist";

let readyPromise: Promise<void> | null = null;

/**
 * 本环境的 dev server 不会对 node_modules 内文件的 `?url` / `?worker` 后缀做 Vite 转换，
 * 浏览器会把原始 worker 脚本当普通 ES 模块加载，因其没有 default 导出而抛 SyntaxError。
 *
 * 因此这里完全不使用带后缀的导入，改用与打包器无关的方案：
 * 以普通动态 import 载入 worker 模块（它是合法 ESM，具名导出 WorkerMessageHandler），
 * 挂到 `globalThis.pdfjsWorker` —— pdf.js 的 PDFWorker 初始化时检测到该全局量，
 * 会直接走「主线程内 worker」分支（见 pdf.mjs 中 #mainThreadWorkerMessageHandler），
 * 此后 workerSrc 永远不会被读取，dev / build / 静态托管三种模式行为一致。
 *
 * 首次调用会额外加载 ~1.2MB 的 worker 模块（独立 chunk），之后复用 Promise 缓存。
 */
export function ensurePdfReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = import("pdfjs-dist/build/pdf.worker.min.mjs").then((mod) => {
      (globalThis as unknown as Record<string, unknown>).pdfjsWorker = mod;
    });
  }
  return readyPromise;
}

export default pdfjs;
