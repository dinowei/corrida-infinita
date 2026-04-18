export const COUNTDOWN_STEPS = ['3', '2', '1', 'GO!'] as const;
export const ROAD_WIDTH = 8;
export const PLAYER_LIMIT = ROAD_WIDTH * 0.38;
export const MODEL_PATH = '/assets/models/carro_opt.glb';

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
