/**
 * 自动打版脚本：把补丁版本号 +0.0.1（如 4.0.0 → 4.0.1）。
 * 由 push-to-github.bat 在每次推送前自动调用，也可手动执行：
 *   node scripts/bump-version.mjs
 * 同步更新两处：src/version.ts 与 package.json 的 version 字段。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const versionFile = join(root, "src", "version.ts");
const pkgFile = join(root, "package.json");

const src = readFileSync(versionFile, "utf8");
const m = /export const APP_VERSION = "(\d+)\.(\d+)\.(\d+)"/.exec(src);
if (!m) {
  console.error("[bump-version] 无法从 src/version.ts 解析版本号");
  process.exit(1);
}
const major = Number(m[1]);
const minor = Number(m[2]);
const patch = Number(m[3]);
const next = `${major}.${minor}.${patch + 1}`;

writeFileSync(
  versionFile,
  src.replace(/export const APP_VERSION = "\d+\.\d+\.\d+"/, `export const APP_VERSION = "${next}"`),
  "utf8",
);

try {
  const pkg = JSON.parse(readFileSync(pkgFile, "utf8"));
  pkg.version = next;
  writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + "\n", "utf8");
} catch (e) {
  console.warn("[bump-version] package.json 同步失败（忽略）：", e.message);
}

console.log(`[bump-version] ${major}.${minor}.${patch} → ${next}`);
