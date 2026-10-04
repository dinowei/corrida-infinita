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

export type BiomeDefinition = {
  id: BiomeId;
  name: string;
  ground: string;
  trees: string[];
  buildings: string[];
  mountains: string;
  density: { trees: number; buildings: number; mountains: number };
};

export type WeatherDefinition = {
  id: WeatherId;
  name: string;
  description: string;
  /** multiplicador de aderência lateral (1 = seco) */
  grip: number;
  /** multiplicador de frenagem */
  braking: number;
  background: string;
  fog: { color: string; near: number; far: number };
  sky: { sunPosition: [number, number, number]; turbidity: number; rayleigh: number; mie: number };
  light: { sun: number; sunColor: string; ambient: number; hemisphere: number };
  exposure: number;
  /** 0 = sem chuva, 1 = chuva forte */
  rain: number;
  /** 0 = pista seca, 1 = encharcada (asfalto mais escuro e refletivo) */
  wetness: number;
};

export type QualityProfile = {
  level: QualityLevel;
  label: string;
  dpr: [number, number];
  postprocessing: boolean;
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
