import type { HexColor, SkyStyle } from './types';

/**
 * Espelho em TypeScript do gradiente em faixas do shader (skyShader.ts →
 * `skyBands`). Serve para testes unitários e para quem precisar da cor do céu
 * na CPU (ex.: cor de névoa casando com a faixa do horizonte).
 *
 * Trabalha em RGB LINEAR, igual ao shader (three converte as cores sRGB dos
 * uniforms para linear).
 */

export type Rgb = [number, number, number];

export const DEFAULT_BAND_CURVE = 0.6;
export const DEFAULT_SUN_BULGE = 0.15;
/** expoente da proximidade do sol usada no "bojo" das faixas: max(dot(d, sol), 0)^N */
export const SUN_BULGE_POWER = 6;

/** Proximidade do sol (0..1) para uma direção, igual ao shader. */
export function sunProximity(cosAngle: number): number {
  return Math.pow(Math.max(cosAngle, 0), SUN_BULGE_POWER);
}

/** sRGB (0..1) → linear, mesma fórmula do THREE.ColorManagement. */
export function srgbToLinear(c: number): number {
  return c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4);
}

/** '#rrggbb' (ou '#rgb') → RGB linear. */
export function hexToLinear(hex: HexColor): Rgb {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('');
  const n = parseInt(h, 16);
  if (h.length !== 6 || Number.isNaN(n)) throw new Error(`cor inválida: ${hex}`);
  return [
    srgbToLinear(((n >> 16) & 255) / 255),
    srgbToLinear(((n >> 8) & 255) / 255),
    srgbToLinear((n & 255) / 255),
  ];
}

/** Número de faixas efetivo (clamp em 3..5, inteiro). */
export function clampBands(bands: number): number {
  return Math.min(5, Math.max(3, Math.round(bands)));
}

/**
 * Coordenada contínua "de faixa" t ∈ [0,1] para uma elevação.
 * @param elevation d.y da direção de visão (0 = horizonte, 1 = zênite)
 * @param sunProximity 0..1, já elevado à potência (ver shader); empurra as
 *   faixas do horizonte para cima em volta do sol.
 */
export function bandCoord(style: SkyStyle, elevation: number, sunProximity = 0): number {
  const curve = style.bandCurve ?? DEFAULT_BAND_CURVE;
  const bulge = style.sunBulge ?? DEFAULT_SUN_BULGE;
  const e = Math.min(1, Math.max(0, elevation));
  const t = Math.pow(e, curve) - bulge * sunProximity;
  return Math.min(1, Math.max(0, t));
}

/** Índice da faixa (0 = faixa do horizonte, bands-1 = zênite). */
export function bandIndex(style: SkyStyle, elevation: number, sunProximity = 0): number {
  const n = clampBands(style.bands);
  return Math.min(n - 1, Math.floor(bandCoord(style, elevation, sunProximity) * n));
}

function mix3(a: Rgb, b: Rgb, k: number): Rgb {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/**
 * Cor CHAPADA da faixa i: horizon → upper → zenith amostrados em s = i/(n-1).
 * Cada faixa é uma cor única (sem gradiente dentro da faixa).
 */
export function bandRampColor(style: SkyStyle, index: number): Rgb {
  const n = clampBands(style.bands);
  const s = Math.min(1, Math.max(0, index / (n - 1)));
  const hz = hexToLinear(style.horizon);
  const up = hexToLinear(style.upper);
  const ze = hexToLinear(style.zenith);
  return s < 0.5 ? mix3(hz, up, s * 2) : mix3(up, ze, (s - 0.5) * 2);
}

/**
 * Cor do céu (sem sol/nuvens) para uma elevação. Abaixo do horizonte devolve
 * a cor do chão. Versão sem antisserrilhado: transições 100% duras.
 */
export function bandColor(style: SkyStyle, elevation: number, sunProximity = 0): Rgb {
  if (elevation < 0) return hexToLinear(style.ground);
  return bandRampColor(style, bandIndex(style, elevation, sunProximity));
}

/**
 * Elevações (d.y) onde cada fronteira de faixa cai, sem efeito do sol.
 * Útil para testes e para alinhar cenário com as faixas.
 */
export function bandEdges(style: SkyStyle): number[] {
  const n = clampBands(style.bands);
  const curve = style.bandCurve ?? DEFAULT_BAND_CURVE;
  const edges: number[] = [];
  for (let k = 1; k < n; k += 1) edges.push(Math.pow(k / n, 1 / curve));
  return edges;
}
