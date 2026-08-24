import * as pdfjs from "pdfjs-dist";
// Vite 原生 worker 导入：dev 与 build 下都能正确实例化，
// 避免 `?url` 在 dev 模式被当作 ES 模块伺服导致的
// "does not provide an export named 'default'" 错误。
import PdfWorkerCtor from "pdfjs-dist/build/pdf.worker.min.mjs?worker";

if (!pdfjs.GlobalWorkerOptions.workerPort) {
  pdfjs.GlobalWorkerOptions.workerPort = new PdfWorkerCtor();
}

export default pdfjs;
