import type { BiomeId, WeatherId } from '../contracts';

/**
 * Versão do gerador procedural. Incremente sempre que uma mudança alterar o
 * cenário gerado para a mesma seed — recordes de versões diferentes não são
 * comparados.
 */
export const GENERATOR_VERSION = 1;

export type RaceKeyParts = {
  trackId: string;
  trackVersion: number;
  biome: BiomeId;
  weather: WeatherId;
  seed: number;
};

/** Identificador reproduzível de uma combinação de corrida. */
export function raceKey(p: RaceKeyParts) {
  return `${p.trackId}@${p.trackVersion}|${p.biome}|${p.weather}|s${p.seed}|g${GENERATOR_VERSION}`;
}

/** Gerador pseudoaleatório determinístico (mulberry32). */
export function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
