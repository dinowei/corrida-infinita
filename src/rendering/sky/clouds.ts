/**
 * Layout das nuvens cel (fonte única dos números usados no shader).
 *
 * As nuvens são cúmulos "de perfil" em coordenadas (azimute, elevação) do
 * domo: cada uma tem BASE RETA horizontal, 2–3 lobos arredondados por cima,
 * sombra na faixa de baixo e um traço fino no lado do sol. Elas vivem em
 * FILEIRAS de elevação que crescem geometricamente (fileiras perto do
 * horizonte são baixas = nuvens distantes/pequenas; mais alto = maiores).
 * Cada fileira é dividida em células de azimute; cada célula tem no máximo
 * uma nuvem. O shader avalia só a fileira do pixel e a de baixo, e 3
 * células por fileira (6 nuvens), sem ruído fbm: só círculos e caixas.
 *
 * Este arquivo espelha a geometria em TS para testar as garantias que
 * permitem avaliar tão poucas células (nenhuma nuvem escapa da vizinhança).
 */

/** número de fileiras de cúmulos */
export const CLOUD_ROWS = 5;
/** razão geométrica entre alturas de fileiras consecutivas */
export const CLOUD_ROW_GROWTH = 1.45;
/** altura (rad) da fileira 0 com scale = 1 */
export const CLOUD_ROW0 = 0.07;
/** largura mínima de célula (métrica) em múltiplos da altura da fileira */
export const CLOUD_CELL = 2.6;
/** nuvens com altura menor que isto (em pixels) não são desenhadas: sem lascas */
export const CLOUD_MIN_PX = 7;
/** altura da nuvem em múltiplos da altura da fileira [mín, máx] */
export const CLOUD_HEIGHT: [number, number] = [0.8, 1.6];
/** meia-largura da nuvem em múltiplos da sua altura [mín, máx] */
export const CLOUD_ASPECT: [number, number] = [1.0, 1.7];
/** variação da base dentro da fileira, em alturas de fileira */
export const CLOUD_BASE_JITTER = 0.3;
/** variação do centro dentro da célula, em larguras de célula (±metade) */
export const CLOUD_X_JITTER = 0.3;
/** elevação (rad) a partir da qual a chance de nuvem cai até zero (zênite mais limpo) */
export const CLOUD_ZENITH_FADE: [number, number] = [0.5, 0.95];

const TAU = Math.PI * 2;

/** altura da fileira r (rad) */
export function cloudRowStep(r: number, scale = 1): number {
  return (CLOUD_ROW0 / Math.max(scale, 0.05)) * Math.pow(CLOUD_ROW_GROWTH, r);
}

/** elevação da base da fileira r (rad); e0 = elevação da fileira 0 */
export function cloudRowBase(r: number, scale = 1, e0 = 0): number {
  const g = CLOUD_ROW_GROWTH;
  return e0 + ((CLOUD_ROW0 / Math.max(scale, 0.05)) * (Math.pow(g, r) - 1)) / (g - 1);
}

/** fileira que contém a elevação e (pode passar de CLOUD_ROWS-1; < 0 → -1) */
export function cloudRowIndex(e: number, scale = 1, e0 = 0): number {
  if (e < e0) return -1;
  const g = CLOUD_ROW_GROWTH;
  const row0 = CLOUD_ROW0 / Math.max(scale, 0.05);
  return Math.floor(Math.log(1 + ((e - e0) * (g - 1)) / row0) / Math.log(g));
}

/** número de células de azimute da fileira r (inteiro, para fechar 360° sem costura) */
export function cloudColumns(r: number, scale = 1, e0 = 0): number {
  const sr = cloudRowStep(r, scale);
  const base = cloudRowBase(r, scale, e0);
  // cos da elevação mais alta que uma nuvem desta fileira alcança (célula
  // métrica nunca menor que CLOUD_CELL * sr em nenhum ponto da nuvem)
  const top = Math.min(base + 2 * sr, Math.PI / 2 - 0.05);
  return Math.max(3, Math.floor((TAU * Math.cos(top)) / (sr * CLOUD_CELL)));
}

/** maior topo (rad, relativo à base da fileira) que uma nuvem da fileira pode ter */
export function cloudMaxReach(r: number, scale = 1): number {
  const sr = cloudRowStep(r, scale);
  return sr * (CLOUD_BASE_JITTER + CLOUD_HEIGHT[1]);
}

/** maior meia-extensão horizontal métrica de uma nuvem da fileira r */
export function cloudMaxHalfWidth(r: number, scale = 1): number {
  const hMax = cloudRowStep(r, scale) * CLOUD_HEIGHT[1];
  return hMax * CLOUD_ASPECT[1];
}

/** a nuvem é desenhada? (regra anti-lasca) */
export function cloudVisible(heightRad: number, pixelAngleRad: number): boolean {
  return heightRad >= CLOUD_MIN_PX * pixelAngleRad;
}
