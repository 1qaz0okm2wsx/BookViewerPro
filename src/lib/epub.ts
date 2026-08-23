import JSZip from "jszip";
import { uid } from "../types";

export interface EpubChapterSrc {
  title: string;
  html: string;
}

export interface BuildEpubOptions {
  title: string;
  author: string;
  chapters: EpubChapterSrc[];
  version: 2 | 3;
  cover?: string; // dataURL
  language?: string;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/&nbsp;/g, "&#160;");
}

function chapterXhtml(title: string, html: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <meta charset="utf-8"/>
  <title>${esc(title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <h1>${esc(title)}</h1>
  ${sanitizeHtml(html)}
</body>
</html>`;
}

const STYLE_CSS = `body { font-family: "Noto Serif SC", "Songti SC", serif; line-height: 1.85; margin: 1em; color: #2a322e; }
h1 { font-size: 1.5em; text-align: center; margin: 1.2em 0 1em; letter-spacing: .08em; }
h2 { font-size: 1.25em; margin: 1.2em 0 .6em; }
p { margin: .6em 0; text-align: justify; }
img { max-width: 100%; }
blockquote { border-left: 3px solid #c89b3c; padding-left: 1em; color: #666; }
`;

/** 在浏览器端构建一个标准 EPUB 2/3 包（zip 结构） */
export async function buildEpub(opts: BuildEpubOptions): Promise<Blob> {
  const zip = new JSZip();
  const uuid = uid();
  const lang = opts.language ?? "zh-CN";
  const v3 = opts.version === 3;
  const chapters = opts.chapters.length ? opts.chapters : [{ title: "正文", html: "<p>（空文档）</p>" }];

  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
  );

  let manifest = "";
  let spine = "";
  let navItems = "";
  let navPoints = "";
  chapters.forEach((ch, i) => {
    const id = `ch${i + 1}`;
    zip.file(`OEBPS/${id}.xhtml`, chapterXhtml(ch.title, ch.html));
    manifest += `    <item id="${id}" href="${id}.xhtml" media-type="application/xhtml+xml"/>\n`;
    spine += `    <itemref idref="${id}"/>\n`;
    navItems += `        <li><a href="${id}.xhtml">${esc(ch.title)}</a></li>\n`;
    navPoints += `    <navPoint id="${id}" playOrder="${i + 1}">
      <navLabel><text>${esc(ch.title)}</text></navLabel>
      <content src="${id}.xhtml"/>
    </navPoint>\n`;
  });
  zip.file("OEBPS/style.css", STYLE_CSS);

  let coverManifest = "";
  let coverMeta = "";
  let coverGuide = "";
  if (opts.cover && opts.cover.startsWith("data:")) {
    const m = /^(image\/[a-zA-Z+]+);base64,(.+)$/.exec(opts.cover);
    if (m) {
      zip.file("OEBPS/cover.jpg", m[2], { base64: true });
      coverManifest = v3
        ? `    <item id="cover-image" href="cover.jpg" media-type="image/jpeg" properties="cover-image"/>\n`
        : `    <item id="cover-image" href="cover.jpg" media-type="image/jpeg"/>\n`;
      coverMeta = `  <meta name="cover" content="cover-image"/>\n`;
      coverGuide = `  <guide><reference type="cover" title="封面" href="cover.xhtml"/></guide>\n`;
      zip.file(
        "OEBPS/cover.xhtml",
        `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>封面</title></head>
<body style="text-align:center"><img src="cover.jpg" alt="封面" style="max-width:100%"/></body>
</html>`,
      );
      manifest = `    <item id="cover-page" href="cover.xhtml" media-type="application/xhtml+xml"/>\n` + manifest;
      spine = `    <itemref idref="cover-page"/>\n` + spine;
    }
  }

  zip.file(
    "OEBPS/nav.xhtml",
    `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><meta charset="utf-8"/><title>目录</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>目录</h1>
    <ol>
${navItems}    </ol>
  </nav>
</body>
</html>`,
  );
  zip.file(
    "OEBPS/toc.ncx",
    `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="urn:uuid:${uuid}"/></head>
  <docTitle><text>${esc(opts.title)}</text></docTitle>
  <navMap>
${navPoints}  </navMap>
</ncx>`,
  );

  if (v3) manifest += `    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>\n`;
  manifest += `    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>\n`;
  manifest += `    <item id="style" href="style.css" media-type="text/css"/>\n`;
  manifest += coverManifest;

  const modified = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="${v3 ? "3.0" : "2.0"}" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">urn:uuid:${uuid}</dc:identifier>
    <dc:title>${esc(opts.title)}</dc:title>
    <dc:creator>${esc(opts.author || "佚名")}</dc:creator>
    <dc:language>${lang}</dc:language>
${v3 ? `    <meta property="dcterms:modified">${modified}</meta>\n` : ""}${coverMeta}  </metadata>
  <manifest>
${manifest}  </manifest>
  <spine toc="ncx">
${spine}  </spine>
${coverGuide}</package>`,
  );

  return zip.generateAsync({
    type: "blob",
    mimeType: "application/epub+zip",
    compression: "DEFLATE",
  });
}
