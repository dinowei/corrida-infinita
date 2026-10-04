export type GamePhase = 'menu' | 'countdown' | 'running' | 'paused' | 'finished';

export type GameMode = 'infinite' | 'circuit';

export type VehicleId = 'gtr' | 'aurora' | 'vespa';

/** Entrada combinada (teclado + gamepad + toque), já normalizada. */
export type ControlState = {
  steer: number; // -1 esquerda .. 1 direita
  throttle: number; // 0..1
  brake: number; // 0..1
  nitro: boolean;
};

export type HudState = {
  speed: number;
  nitro: number;
  // Infinito
  distance: number;
  score: number;
  best: number;
  hull: number;
  // Circuito
  lap: number;
  totalLaps: number;
  lapTime: number;
  bestLap: number | null;
  raceTime: number;
  position: number;
  racers: number;
  offTrack: boolean;
};

export type MinimapDot = { x: number; z: number; player: boolean; color: string };

export type RaceResult =
  | {
      mode: 'infinite';
      score: number;
      distance: number;
      best: number;
      newRecord: boolean;
    }
  | {
      mode: 'circuit';
      position: number;
      racers: number;
      totalTime: number;
      bestLap: number;
      recordLap: number | null;
      recordTotal: number | null;
      newLapRecord: boolean;
      newTotalRecord: boolean;
    };
