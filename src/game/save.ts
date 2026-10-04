import { SAVE_KEY, SAVE_VERSION } from './constants';
import type { QualityLevel, WeatherId } from './contracts';

export type TrackRecord = {
  bestLap: number | null;
  bestTotal: number | null;
  /** tempos acumulados em cada checkpoint na melhor volta, para os parciais */
  bestSplits: number[] | null;
};

export type Settings = {
  quality: QualityLevel | null; // null = detectar
  showStats: boolean;
  muted: boolean;
  weather: WeatherId;
};

export type SaveBlob = {
  version: number;
  bestScore: number;
  bestDistance: number;
  /** chave = raceKey(...) (pista, versão, bioma, clima, seed, gerador) */
  records: Record<string, TrackRecord>;
  settings: Settings;
};

const defaultSettings = (): Settings => ({ quality: null, showStats: false, muted: false, weather: 'clear' });

function defaults(): SaveBlob {
  return { version: SAVE_VERSION, bestScore: 0, bestDistance: 0, records: {}, settings: defaultSettings() };
}

const positiveOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

/** Chave dos recordes da v2 (antes de raceKey existir). */
const V2_TRACK_KEY = 'costa-neon@1|costa-neon|clear|s1337|g1';

/** Converte qualquer versão anterior para o formato atual. */
export function migrate(raw: unknown): SaveBlob {
  const blob = defaults();
  if (!raw || typeof raw !== 'object') return blob;
  const parsed = raw as Record<string, unknown>;

  const legacyBest = typeof parsed.best === 'number' ? parsed.best : 0; // v1
  blob.bestScore = Math.max(0, Math.floor(Number(parsed.bestScore ?? legacyBest) || 0));
  blob.bestDistance = Math.max(0, Math.floor(Number(parsed.bestDistance) || 0));

  const readRecord = (rec: unknown): TrackRecord => {
    const r = (rec ?? {}) as Record<string, unknown>;
    const splits = Array.isArray(r.bestSplits) && r.bestSplits.every((n) => typeof n === 'number') ? (r.bestSplits as number[]) : null;
    return { bestLap: positiveOrNull(r.bestLap), bestTotal: positiveOrNull(r.bestTotal), bestSplits: splits };
  };

  // v2 guardava por id de pista em `tracks`.
  if (parsed.tracks && typeof parsed.tracks === 'object') {
    const v2 = (parsed.tracks as Record<string, unknown>)['costa-neon'];
    if (v2) blob.records[V2_TRACK_KEY] = readRecord(v2);
  }
  if (parsed.records && typeof parsed.records === 'object') {
    for (const [key, rec] of Object.entries(parsed.records as Record<string, unknown>)) {
      blob.records[key] = readRecord(rec);
    }
  }
  if (parsed.settings && typeof parsed.settings === 'object') {
    const s = parsed.settings as Partial<Settings>;
    blob.settings = {
      quality: s.quality === 'low' || s.quality === 'medium' || s.quality === 'high' ? s.quality : null,
      showStats: Boolean(s.showStats),
      muted: Boolean(s.muted),
      weather: s.weather === 'rain' ? 'rain' : 'clear',
    };
  }
  return blob;
}

export function loadSave(): SaveBlob {
  if (typeof window === 'undefined') return defaults();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? migrate(JSON.parse(raw)) : defaults();
  } catch {
    return defaults();
  }
}

function write(blob: SaveBlob) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...blob, version: SAVE_VERSION }));
  } catch {
    /* private mode / quota */
  }
}

export function loadBest(): number {
  return loadSave().bestScore;
}

export function saveSettings(patch: Partial<Settings>) {
  const blob = loadSave();
  blob.settings = { ...blob.settings, ...patch };
  write(blob);
  return blob.settings;
}

export function saveInfiniteRun(score: number, distance: number) {
  const blob = loadSave();
  const newRecord = score > blob.bestScore;
  blob.bestScore = Math.max(blob.bestScore, Math.floor(score));
  blob.bestDistance = Math.max(blob.bestDistance, Math.floor(distance));
  write(blob);
  return { newRecord, best: blob.bestScore };
}

/** Registra uma corrida de circuito e informa se houve recorde. */
export function saveCircuitRun(key: string, total: number, bestLap: number, bestLapSplits: number[]) {
  const blob = loadSave();
  const prev = blob.records[key] ?? { bestLap: null, bestTotal: null, bestSplits: null };
  const newLapRecord = prev.bestLap === null || bestLap < prev.bestLap;
  const newTotalRecord = prev.bestTotal === null || total < prev.bestTotal;
  blob.records[key] = {
    bestLap: newLapRecord ? bestLap : prev.bestLap,
    bestTotal: newTotalRecord ? total : prev.bestTotal,
    bestSplits: newLapRecord ? bestLapSplits : prev.bestSplits,
  };
  write(blob);
  return { newLapRecord, newTotalRecord, prev };
}

export function getRecord(key: string): TrackRecord {
  return loadSave().records[key] ?? { bestLap: null, bestTotal: null, bestSplits: null };
}
