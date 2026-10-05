import type { ControlState } from '../../types/game';
import { weatherGrip, type CircuitSession } from '../modes/circuitSession';

/**
 * Piloto automático do jogador, usado pelos testes e pelo harness de
 * screenshots para levar a corrida a um momento exato de forma
 * determinística. Segue a linha de dentro das curvas e freia pela
 * curvatura à frente.
 */
export function circuitAutopilot(session: CircuitSession): ControlState {
  const pl = session.player;
  const tr = session.track;
  const v = pl.speed / 3.6;
  const idx = Math.floor(((((pl.p + v * 1.2) % tr.length) + tr.length) % tr.length) / tr.step);
  let k = 0;
  for (let j = 0; j < 60; j += 3) {
    const c = tr.curvature[(idx + j) % tr.count];
    if (Math.abs(c) > Math.abs(k)) k = c;
  }
  const targetD = -Math.sign(k) * Math.min(1, Math.abs(k) * 200) * 4;
  const steer = Math.max(-1, Math.min(1, (targetD - pl.d) * 0.35 - pl.latVel * 0.3));
  const grip = session.vehicle.grip * weatherGrip(session.weather, pl.speed);
  const limit = Math.sqrt((9 * grip) / Math.max(Math.abs(k), 1e-4) / 0.2) * 3.6 * 1.25;
  return {
    steer,
    throttle: pl.speed < limit ? 1 : 0,
    brake: pl.speed > limit + 15 ? 1 : 0,
    nitro: Math.abs(k) < 1 / 400 && pl.nitro > 0.3,
  };
}
