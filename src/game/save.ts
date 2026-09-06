import { SAVE_KEY, SAVE_VERSION } from "./constants";

type SaveBlob = {
  version: number;
  best: number;
};

function defaults(): SaveBlob {
  return { version: SAVE_VERSION, best: 0 };
}

export function loadBest(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as Partial<SaveBlob>;
    const merged = { ...defaults(), ...parsed, version: SAVE_VERSION };
    return Number.isFinite(merged.best) ? Math.max(0, Math.floor(merged.best)) : 0;
  } catch {
    return 0;
  }
}

export function saveBest(best: number) {
  try {
    const blob: SaveBlob = { version: SAVE_VERSION, best: Math.max(0, Math.floor(best)) };
    localStorage.setItem(SAVE_KEY, JSON.stringify(blob));
  } catch {
    /* private mode / quota */
  }
}
