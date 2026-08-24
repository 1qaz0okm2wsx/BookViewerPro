import { get, set, del as idbDel } from "idb-keyval";

export const KEYS = {
  books: "bv:books",
  notes: "bv:notes",
  marks: "bv:marks",
  progress: "bv:progress",
  seeded: "bv:seeded",
  stats: "bv:stats",
};

export const fileKey = (id: string) => `bv:file:${id}`;

export async function loadJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const v = await get<T>(key);
    return v === undefined ? fallback : v;
  } catch (e) {
    console.warn("loadJSON failed:", key, e);
    return fallback;
  }
}

export async function saveJSON(key: string, value: unknown): Promise<void> {
  try {
    await set(key, value);
  } catch (e) {
    console.warn("saveJSON failed:", key, e);
  }
}

export const del = idbDel;
