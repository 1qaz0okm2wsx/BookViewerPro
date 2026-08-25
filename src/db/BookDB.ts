/**
 * 每书一库：以 `book_${bookId}::${store}` 为键，为每本书维护逻辑上相互隔离的
 * 数据存储（元数据 / 翻译缓存 / 向量 / 思维导图 / 统计 / 进度），并提供
 * 单书数据库的整体导出（JSON）与清理能力。
 *
 * 底层仍使用 IndexedDB（idb-keyval），但通过命名空间保证书与书之间数据不交叉，
 * 且可以把"一本书的全部数据"打包成一份可迁移、可备份的 JSON。
 */
import { get, set, del, keys } from "idb-keyval";
import type { Annotation, BookMeta } from "../types";

export type BookStore =
  | "metadata"
  | "translations"
  | "embeddings"
  | "mindmap"
  | "stats"
  | "progress"
  | "draft";

const prefix = (bookId: string) => `book_${bookId}`;
const storeKey = (bookId: string, store: BookStore, sub = "") =>
  `${prefix(bookId)}::${store}${sub ? `::${sub}` : ""}`;

export async function loadBookStore<T>(bookId: string, store: BookStore, sub = "", fallback?: T): Promise<T | undefined> {
  try {
    const v = await get<T>(storeKey(bookId, store, sub));
    return v === undefined ? fallback : v;
  } catch {
    return fallback;
  }
}

export async function saveBookStore<T>(bookId: string, store: BookStore, value: T, sub = ""): Promise<void> {
  try {
    await set(storeKey(bookId, store, sub), value);
  } catch (e) {
    console.warn("saveBookStore failed", store, e);
  }
}

export async function delBookStore(bookId: string, store: BookStore, sub = ""): Promise<void> {
  try {
    await del(storeKey(bookId, store, sub));
  } catch { /* ignore */ }
}

/** 列出本机所有书籍数据库（按 bookId 去重） */
export async function listBookDBs(): Promise<string[]> {
  try {
    const all = (await keys()) as string[];
    const ids = new Set<string>();
    all.forEach((k) => {
      if (typeof k === "string" && k.startsWith("book_")) {
        ids.add(k.split("::")[0].slice("book_".length));
      }
    });
    return Array.from(ids);
  } catch {
    return [];
  }
}

/** 清空一本书的全部数据（各 store 及子键） */
export async function clearBookDB(bookId: string): Promise<void> {
  try {
    const all = (await keys()) as string[];
    const p = `${prefix(bookId)}::`;
    for (const k of all) {
      if (typeof k === "string" && k.startsWith(p)) await del(k);
    }
  } catch { /* ignore */ }
}

export interface BookDBSnapshot {
  bookId: string;
  exportedAt: string;
  metadata: Partial<BookMeta>;
  annotations: Annotation[];
  stores: Record<string, unknown>;
}

/**
 * 把一本书的数据库整体导出为 JSON（元数据 + 该书全部批注 + 各 store 数据）。
 * 用于备份、迁移与"每书一库"的可验证性。
 */
export async function exportBookDB(
  bookId: string,
  meta: BookMeta | undefined,
  annotations: Annotation[],
): Promise<Blob> {
  const storeNames: BookStore[] = ["metadata", "translations", "embeddings", "mindmap", "stats", "progress", "draft"];
  const stores: Record<string, unknown> = {};
  for (const s of storeNames) {
    const v = await loadBookStore<unknown>(bookId, s);
    if (v !== undefined) stores[s] = v;
  }
  const snap: BookDBSnapshot = {
    bookId,
    exportedAt: new Date().toISOString(),
    metadata: meta
      ? { id: meta.id, title: meta.title, author: meta.author, format: meta.format, size: meta.size, addedAt: meta.addedAt, tags: meta.tags, rating: meta.rating, review: meta.review }
      : {},
    annotations: annotations.filter((a) => a.bookId === bookId),
    stores,
  };
  return new Blob([JSON.stringify(snap, null, 2)], { type: "application/json;charset=utf-8" });
}
