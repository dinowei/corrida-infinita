export type GamePhase = 'idle' | 'countdown' | 'running';

export type KeyboardState = {
  left: boolean;
  right: boolean;
  accelerate: boolean;
  brake: boolean;
};
