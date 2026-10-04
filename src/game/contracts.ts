import type { ControlState, HudState } from '../types/game';

/**
 * Contratos centrais do Plano Mestre v3. Conteúdo (pistas, veículos, biomas,
 * climas) entra por dados; os modos de jogo expõem a mesma interface de
 * sessão para que HUD, telas e testes sejam reutilizados.
 */

export type BiomeId = 'costa-neon';
export type WeatherId = 'clear' | 'rain';
export type QualityLevel = 'low' | 'medium' | 'high';
export type VehicleClass = 'light' | 'balanced' | 'heavy' | 'flyer';

/** Pintura de um veículo: corpo, detalhe, faixa e brilho dos propulsores. */
export type Livery = { body: string; accent: string; stripe: string; glow: string };

export type CheckpointDefinition = {
  id: string;
  /** posição ao longo da volta, 0..1 (0 é a linha de chegada) */
  at: number;
};

export type TrackDefinition = {
  id: string;
  name: string;
  /** muda quando o traçado muda — invalida recordes antigos */
  version: number;
  laps: number;
  width: number;
  scale: number;
  seed: number;
  defaultBiome: BiomeId;
  /** pontos de controle da spline: [x, elevação, z] */
  points: Array<[number, number, number]>;
  /** checkpoints intermediários, em ordem; a linha de chegada é implícita */
  checkpoints: CheckpointDefinition[];
};

/**
 * Paleta limitada e saturada do bioma, aplicada a cenário, pista e HUD.
 * Cores em hex sRGB; o pipeline cel cuida do sombreamento em faixas.
 */
export type BiomePalette = {
  ground: string;
  road: string;
  /** pintas/remendos do asfalto, desenhados por cima da cor chapada */
  roadDetail: string;
  lineYellow: string;
  lineWhite: string;
  curbA: string;
  curbB: string;
  shoulder: string;
  barrier: string;
  deck: string;
  pillar: string;
  metal: string;
  lampGlow: string;
  signBg: string;
  signArrow: string;
  trees: string[];
  trunk: string;
  buildings: string[];
  windows: string[];
  mountains: string;
  mountainSnow: string;
  accent: string;
};

export type BiomeDefinition = {
  id: BiomeId;
  name: string;
  palette: BiomePalette;
  density: { trees: number; buildings: number; mountains: number };
};

/** Iluminação cel: sol, matiz de sombra e ambiente hemisférico em degraus. */
export type CelLighting = {
  /** direção PARA o sol (mundo); é normalizada ao aplicar */
  sunDir: [number, number, number];
  sun: string;
  shadowTint: string;
  skyAmbient: string;
  groundAmbient: string;
  rim: string;
  ink: string;
  reflectSky: string;
  reflectHorizon: string;
  reflectGround: string;
};

export type WeatherDefinition = {
  id: WeatherId;
  name: string;
  description: string;
  /** multiplicador de aderência lateral (1 = seco) */
  grip: number;
  /** multiplicador de frenagem */
  braking: number;
  /** preset do domo cel (ver rendering/sky/presets) */
  skyPreset: 'clear-day' | 'sunset' | 'rain-light' | 'rain-heavy' | 'fog' | 'storm' | 'snow' | 'space';
  fog: { color: string; near: number; far: number };
  /** luz do pipeline cel para este clima */
  light: CelLighting;
  /** 0 = sem chuva, 1 = chuva forte */
  rain: number;
  /** 0 = pista seca, 1 = encharcada (asfalto mais escuro e refletivo) */
  wetness: number;
};

export type QualityProfile = {
  level: QualityLevel;
  label: string;
  dpr: [number, number];
  /** traço de pós-processo (MRT + detecção de bordas); o casco invertido fica sempre ligado */
  edges: boolean;
  /** escala de resolução do passe de bordas (1 = cheia) */
  edgeScale: number;
  /** gotas de chuva com intensidade 1 */
  rainDrops: number;
  /** fração do cenário instanciado (árvores/prédios) */
  scenery: number;
};

export type RaceEvent =
  | { type: 'toast'; text: string }
  | { type: 'sfx'; name: 'crash' | 'pickup' | 'nearMiss' };

/** Interface comum de um modo de jogo, independente do render. */
export interface RaceSession<Result> {
  /** avança a simulação; `racing` é falso durante a contagem e após a chegada */
  update(dt: number, input: ControlState, racing: boolean): void;
  hud(): Partial<HudState>;
  readonly finished: boolean;
  result(): Result | null;
  drainEvents(): RaceEvent[];
}
