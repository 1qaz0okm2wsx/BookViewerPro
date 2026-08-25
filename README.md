<p align="center">
  <img src="https://image.qwenlm.ai/generated-images/dfb8a8bb-c07c-45de-b71a-81dded4a548b/_result.png" alt="墨阁 BookViewer Pro" width="100%" />
</p>

<h1 align="center">墨阁 BookViewer Pro</h1>
<p align="center">
  <strong>纯本地运行的全能书籍查看器与编辑器</strong><br/>
  阅读 · 转换 · 编辑 · 批注 · 打包导出，数据不出你的设备
</p>

<p align="center">
  <img alt="构建状态" src="https://img.shields.io/badge/build-passing-3f6b52" />
  <img alt="平台" src="https://img.shields.io/badge/平台-Windows%20%2F%20Web-14231c" />
  <img alt="许可" src="https://img.shields.io/badge/license-MIT-c89b3c" />
  <img alt="版本" src="https://img.shields.io/badge/version-1.0.0-c6431f" />
</p>

---

## 它是什么

**墨阁 BookViewer Pro** 是一个部署在本地 Windows 环境、通过 npm 管理的 Web 应用，集**文档查看、格式转换、内容编辑、笔记批注**于一体。所有解析、转换与存储均在浏览器端完成（IndexedDB 持久化），不依赖任何云服务，不上传任何文件。

## 功能总览

| 模块 | 能力 |
| --- | --- |
| 📖 **阅读器** | 分页 / 滚动双模式、缩放、全屏、全文搜索高亮、字号行距调节、日间 / 青瓷 / 夜间三主题、目录抽屉、阅读进度自动恢复 |
| 🔄 **转换器** | EPUB 2/3 互转、DOCX / MD / TXT / HTML / FB2 / MOBI 与 HTML / PDF / DOCX / EPUB / MD 互转、PDF 文本提取、CBZ 合成 PDF 画册、SVG ↔ 位图 |
| ✏️ **编辑器** | 富文本编辑（格式 / 列表 / 链接 / 图片 / 表格）、HTML 源码 + 实时预览双栏、内置 SVG 矢量画板、另存为 HTML / DOCX / EPUB |
| 🗒 **笔记批注** | 四色高亮、下划线、删除线、侧边批注、书签；基于字符偏移持久化，重开自动还原；笔记中心支持筛选 / 搜索 / 回跳原文 |
| 📦 **ZIP 导出** | 原书 + 笔记（JSON / MD / CSV）+ 书签 + 阅读进度 + 元数据 + 转换成果，一键打包，目录结构实时预览 |

## 格式支持矩阵

| 格式 | 阅读 | 编辑 | 转换输出 |
| --- | :---: | :---: | --- |
| EPUB | ✅ | ✅ | EPUB 2 / EPUB 3 / HTML / PDF / DOCX / TXT |
| DOCX | ✅ | ✅ | HTML / PDF / EPUB / Markdown / TXT |
| Markdown | ✅ | ✅ | HTML / DOCX / PDF / EPUB / TXT |
| TXT | ✅ | ✅ | DOCX / PDF / EPUB / HTML / Markdown |
| HTML | ✅ | ✅ | Markdown / DOCX / PDF / EPUB / TXT |
| FB2 | ✅ | ✅ | HTML / PDF / EPUB / DOCX / TXT |
| MOBI / AZW3 | ✅（非 DRM） | — | HTML / PDF / EPUB / TXT |
| PDF | ✅ | — | TXT（文本层提取） |
| CBZ | ✅ | — | PDF 画册 |
| SVG | ✅ | ✅（画板） | PNG（2× 光栅化） |
| PNG / JPG / WebP… | ✅ | — | SVG 封装 |

## 快速开始（Windows）

```powershell
# 1. 安装 Node.js 18+（https://nodejs.org），确认：
node -v   # >= 18

# 2. 克隆并安装依赖
git clone https://github.com/<你的用户名>/bookviewer-pro.git
cd bookviewer-pro
npm install

# 3. 启动开发服务器
npm run dev            # 打开 http://localhost:5173

# 4. 构建生产版本
npm run build          # 产物输出至 dist/
npm run preview        # 本地预览生产构建
```

> 首次启动会自动在本地 IndexedDB 中构建四本公有领域示例书（《论语选读》《道德经》《古典散文三则》EPUB、SVG 藏画），可立即体验全部功能。

## 技术栈

| 类别 | 技术 |
| --- | --- |
| 前端框架 | React 18 + TypeScript |
| 构建工具 | Vite 6 |
| 样式 | Tailwind CSS v4（`@theme` 设计令牌） |
| 压缩包 | JSZip（EPUB / CBZ 解析、ZIP 导出） |
| 文档解析 | mammoth（DOCX）、pdf.js（PDF）、marked（Markdown）、DOMPurify（HTML 净化） |
| 文档生成 | docx（Word 写出）、jspdf + html2canvas（中文 PDF 光栅化排版） |
| 格式互转 | turndown（HTML → Markdown）、自研 EPUB 2/3 构建器、PalmDOC 解码器（MOBI） |
| 本地存储 | IndexedDB（idb-keyval 封装），Blob 存书、JSON 存笔记 |
| 下载 | file-saver |

## 项目结构

```
bookviewer-pro/
├── index.html                 # 入口（字体、错误上报、主题底色）
├── src/
│   ├── main.tsx               # React 挂载点
│   ├── App.tsx                # 外壳：侧栏导航 + 错误边界 + Toast
│   ├── store.tsx              # 全局状态：书库 / 笔记 / 书签 / 进度 / 导出（IndexedDB 持久化）
│   ├── types.ts               # 全局类型与常量
│   ├── lib/
│   │   ├── idb.ts             # IndexedDB 键值封装
│   │   ├── parse.ts           # 11 格式统一解析引擎（ParsedBook 模型）
│   │   ├── convert.ts         # 转换管线（目标矩阵 + 各格式生成器）
│   │   ├── epub.ts            # 浏览器端 EPUB 2/3 包构建器
│   │   ├── pdf.ts             # pdf.js 初始化（?worker 挂载）
│   │   ├── domrange.ts        # 字符偏移选区序列化 / 还原（批注核心）
│   │   ├── cover.ts           # 程序化封面生成（Canvas 竖排书名）
│   │   ├── exportZip.ts       # ZIP 打包与目录结构
│   │   └── samples.ts         # 内置示例书库
│   └── components/
│       ├── Bookshelf.tsx      # 书架（拖拽导入、继续阅读）
│       ├── Reader.tsx         # 阅读器（双模式、搜索、批注、PDF/CBZ）
│       ├── Converter.tsx      # 转换器界面
│       ├── Editor.tsx         # 富文本 + HTML 双栏编辑器
│       ├── SvgEditor.tsx      # SVG 矢量画板
│       ├── NotesPanel.tsx     # 笔记中心
│       ├── ExportPanel.tsx    # ZIP 导出面板
│       ├── icons.tsx          # 54 枚内联 SVG 图标
│       └── ui.tsx             # 按钮 / 弹窗 / 开关等基础组件
├── docs/                      # 开发文档（见下）
├── .github/workflows/         # GitHub Pages 自动部署
└── package.json
```

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [docs/GitHub上传步骤.md](docs/GitHub上传步骤.md) | 从零把本项目推送到你的 GitHub（含常见问题） |
| [docs/架构设计.md](docs/架构设计.md) | 分层架构、数据模型、存储设计、核心算法与关键流程 |
| [docs/功能手册.md](docs/功能手册.md) | 各模块使用说明、快捷键、支持矩阵与已知限制 |
| [docs/开发指南.md](docs/开发指南.md) | 目录详解、实现要点、踩坑记录、新格式扩展教程 |
| [docs/部署指南.md](docs/部署指南.md) | Windows 本地部署、内网访问、GitHub Pages 上线 |

## 设计语言

「松烟墨绿 × 朱砂印 × 鎏金」的书房视觉：思源宋体（正文阅读）+ 思源黑体（界面）+ 马善政楷体（品牌字），宣纸点纹底、封面墙悬浮微动效、状态驱动的光标跟随批注工具条。

## 隐私与合规

- 全部数据（书籍文件、笔记、进度）仅存于本机浏览器 IndexedDB，关闭标签页不丢失，卸载浏览器即清除；
- 无任何网络请求用于传输用户内容（仅 Google Fonts 字体加载，可离线替换）；
- 请仅用于个人合法持有的文档；DRM 加密的 MOBI/AZW3 会被明确拒绝解析。

## License

[MIT](LICENSE) © 墨阁 BookViewer Pro Contributors
