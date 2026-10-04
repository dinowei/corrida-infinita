import type { RivalDefinition } from '../../data/rivals';
import { formatTime } from '../../lib/format';
import type { ControlState, HudState } from '../../types/game';
import type { RaceEvent, RaceSession, WeatherDefinition } from '../contracts';
import { maxCurvatureAhead, type TrackFrames } from '../tracks';
import type { VehicleSpec } from '../vehicles';

/**
 * Simulação do modo Circuito, sem dependência de React ou de render.
 * Os carros andam sobre a spline em (p = progresso em metros, d = deslocamento
 * lateral). É determinística: mesma entrada → mesmo resultado.
 */

/** Fator de "força centrífuga": quanto o carro é empurrado para fora nas curvas. */
export const DRIFT = 0.2;
export const CAR_LENGTH = 3.6;
export const CAR_WIDTH = 1.9;
export const SHOULDER = 2.5;

export type Racer = {
  /** progresso contínuo em metros (passa de várias voltas) */
  p: number;
  d: number;
  latVel: number;
  speed: number; // km/h
  finishTime: number | null;
};

export type PlayerRacer = Racer & { nitro: number; nitroActive: boolean; crashCooldown: number; offTrack: boolean };
export type RivalRacer = Racer & RivalDefinition;

export type CircuitResult = {
  position: number;
  racers: number;
  totalTime: number;
  bestLap: number;
  bestLapSplits: number[];
};

export type CircuitConfig = {
  track: TrackFrames;
  vehicle: VehicleSpec;
  weather: WeatherDefinition;
  rivals: RivalDefinition[];
  /** parciais da melhor volta salva, para mostrar diferença por setor */
  referenceSplits?: number[] | null;
  referenceLap?: number | null;
};

const GRID: Array<{ p: number; d: number }> = [
  { p: -6, d: -3.4 },
  { p: -14, d: 3.4 },
  { p: -22, d: -3.4 },
  { p: -30, d: 3.4 },
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(2)}`;

/**
 * Aderência do clima na velocidade atual. Com pista molhada a aderência cai
 * ainda mais acima de 140 km/h (aquaplanagem), então a chuva pesa justamente
 * nas curvas rápidas, não só nos grampos.
 */
export function weatherGrip(weather: WeatherDefinition, kmh: number) {
  const aquaplaning = weather.wetness * 0.35 * clamp((kmh - 140) / 160, 0, 1);
  return weather.grip * (1 - aquaplaning);
}

export class CircuitSession implements RaceSession<CircuitResult> {
  readonly track: TrackFrames;
  readonly vehicle: VehicleSpec;
  readonly weather: WeatherDefinition;
  readonly laps: number;
  readonly half: number;
  readonly maxD: number;
  readonly player: PlayerRacer;
  readonly rivals: RivalRacer[];

  time = 0;
  finished = false;
  private lapStart = 0;
  /** voltas completas; -1 antes de cruzar a linha pela primeira vez */
  private lapsDone = -1;
  /** índice do próximo checkpoint na volta (== checkpoints.length → linha) */
  private nextCheckpoint: number;
  private currentSplits: number[] = [];
  private bestLap: number | null = null;
  private bestLapSplits: number[] = [];
  private referenceSplits: number[] | null;
  private referenceLap: number | null;
  private events: RaceEvent[] = [];

  constructor(config: CircuitConfig) {
    this.track = config.track;
    this.vehicle = config.vehicle;
    this.weather = config.weather;
    this.laps = config.track.def.laps;
    this.half = config.track.def.width / 2;
    this.maxD = this.half + SHOULDER - CAR_WIDTH / 2;
    this.referenceSplits = config.referenceSplits ?? null;
    this.referenceLap = config.referenceLap ?? null;
    this.nextCheckpoint = config.track.checkpointDistances.length;
    const playerSlot = GRID[Math.min(config.rivals.length, GRID.length - 1)];
    this.player = {
      ...playerSlot,
      latVel: 0,
      speed: 0,
      finishTime: null,
      nitro: 1,
      nitroActive: false,
      crashCooldown: 0,
      offTrack: false,
    };
    this.rivals = config.rivals.map((r, i) => ({ ...r, ...GRID[i], latVel: 0, speed: 0, finishTime: null }));
  }

  get raceLength() {
    return this.laps * this.track.length;
  }

  get position() {
    const pl = this.player;
    if (pl.finishTime !== null) {
      return 1 + this.rivals.filter((r) => r.finishTime !== null && r.finishTime < (pl.finishTime as number)).length;
    }
    return 1 + this.rivals.filter((r) => r.p > pl.p).length;
  }

  get currentLap() {
    return clamp(this.lapsDone + 1, 1, this.laps);
  }

  drainEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }

  update(dt: number, input: ControlState, racing: boolean) {
    if (racing && !this.finished) this.time += dt;
    this.updatePlayer(dt, input, racing);
    if (racing) {
      for (const rival of this.rivals) this.updateRival(rival, dt);
    }
    this.resolveCollisions();
  }

  private updatePlayer(dt: number, input: ControlState, racing: boolean) {
    const pl = this.player;
    const spec = this.vehicle;
    const controlling = racing && !this.finished;
    pl.nitroActive = controlling && input.nitro && pl.nitro > 0.02;
    const i = Math.floor((((pl.p % this.track.length) + this.track.length) % this.track.length) / this.track.step);
    const curvature = this.track.curvature[i % this.track.count];
    pl.offTrack = Math.abs(pl.d) > this.half;

    if (controlling) {
      if (input.throttle > 0 && pl.speed < spec.topSpeed) pl.speed += spec.accel * input.throttle * dt;
      if (input.throttle === 0) pl.speed -= (5 + pl.speed * 0.035) * dt;
      pl.speed -= spec.brake * this.weather.braking * input.brake * dt;
      if (pl.nitroActive) {
        pl.speed += 75 * dt;
        pl.nitro = Math.max(0, pl.nitro - spec.nitroBurn * dt);
      } else {
        pl.nitro = Math.min(1, pl.nitro + 0.055 * dt);
      }
      const cap = pl.nitroActive ? spec.nitroSpeed : spec.topSpeed;
      if (pl.speed > cap) pl.speed = Math.max(cap, pl.speed - 55 * dt);
      if (pl.offTrack && pl.speed > 110) pl.speed -= 85 * dt;
    } else if (this.finished) {
      pl.speed = Math.max(0, pl.speed - 40 * dt);
    }
    pl.speed = Math.max(0, pl.speed);

    const v = pl.speed / 3.6;
    const steer = controlling ? input.steer : 0;
    const steerRate = (4.5 + v * 0.085) * spec.handling;
    const grip = spec.grip * weatherGrip(this.weather, pl.speed);
    const push = (-curvature * v * v * DRIFT) / grip;
    const targetLat = steer * steerRate + (racing ? push : 0);
    // Na chuva o carro responde mais devagar (menos aderência).
    pl.latVel = lerp(pl.latVel, targetLat, 1 - Math.exp(-dt * 7 * this.weather.grip));
    pl.d += pl.latVel * dt;
    pl.crashCooldown = Math.max(0, pl.crashCooldown - dt);
    if (Math.abs(pl.d) > this.maxD) {
      pl.d = Math.sign(pl.d) * this.maxD;
      if (Math.abs(pl.latVel) > 2.5 && pl.crashCooldown <= 0) {
        pl.speed *= 0.8;
        pl.crashCooldown = 0.6;
        this.events.push({ type: 'sfx', name: 'crash' });
      }
      pl.latVel *= -0.25;
    }

    if (racing) pl.p += v * dt;
    this.checkProgress();
  }

  /** Checkpoints ordenados: cada alvo só conta depois do anterior. */
  private checkProgress() {
    const pl = this.player;
    const cps = this.track.checkpointDistances;
    const L = this.track.length;
    for (;;) {
      if (this.finished) return;
      const base = this.lapsDone * L;
      const atLine = this.nextCheckpoint >= cps.length;
      const target = base + (atLine ? L : cps[this.nextCheckpoint]);
      if (pl.p < target) return;

      if (!atLine) {
        const split = this.time - this.lapStart;
        this.currentSplits.push(split);
        const ref = this.referenceSplits?.[this.nextCheckpoint];
        this.events.push({
          type: 'toast',
          text: `Setor ${this.nextCheckpoint + 1} · ${formatTime(split)}${ref !== undefined ? ` (${signed(split - ref)})` : ''}`,
        });
        this.nextCheckpoint += 1;
        continue;
      }

      // Linha de chegada.
      const completed = this.lapsDone >= 0;
      this.lapsDone += 1;
      this.nextCheckpoint = 0;
      if (!completed) {
        this.lapStart = this.time;
        this.currentSplits = [];
        continue;
      }
      const lapTime = this.time - this.lapStart;
      this.lapStart = this.time;
      const isBest = this.bestLap === null || lapTime < this.bestLap;
      if (isBest) {
        this.bestLap = lapTime;
        this.bestLapSplits = this.currentSplits;
      }
      if (this.referenceLap === null || lapTime < this.referenceLap) {
        this.referenceLap = lapTime;
        this.referenceSplits = this.currentSplits;
      }
      this.currentSplits = [];

      if (this.lapsDone >= this.laps) {
        this.finished = true;
        pl.finishTime = this.time;
        this.events.push({ type: 'toast', text: `Chegada! ${formatTime(this.time)}` });
        return;
      }
      const label = this.lapsDone === this.laps - 1 ? 'Última volta' : `Volta ${this.lapsDone + 1}/${this.laps}`;
      this.events.push({
        type: 'toast',
        text: `${label} · ${formatTime(lapTime)}${isBest && this.lapsDone > 1 ? ' · melhor volta!' : ''}`,
      });
      this.events.push({ type: 'sfx', name: 'pickup' });
    }
  }

  private updateRival(rv: RivalRacer, dt: number) {
    const pl = this.player;
    const rvV = rv.speed / 3.6;
    const kAhead = maxCurvatureAhead(this.track, rv.p, 30 + rvV * 1.6);
    const vCurve = Math.sqrt((44 * rv.skill * weatherGrip(this.weather, rv.speed)) / Math.max(Math.abs(kAhead), 1e-4)) * 3.6;
    let target = Math.min(rv.topSpeed * rv.skill, vCurve);
    const gap = pl.p - rv.p;
    if (!this.finished) {
      if (gap > 40) target *= 1.07;
      else if (gap < -70) target *= 0.95;
    }
    if (rv.finishTime !== null) target = Math.min(target, 140);
    if (rv.speed < target) rv.speed += rv.accel * dt;
    else rv.speed = Math.max(target, rv.speed - 90 * this.weather.braking * dt);

    // Linha de corrida: tangencia o lado de dentro das curvas.
    const inside = -Math.sign(kAhead) * clamp(Math.abs(kAhead) * 260, 0, 1);
    let targetD = (inside * 0.55 + rv.bias * 0.3) * (this.half - 1.5);
    for (const other of [pl, ...this.rivals]) {
      if (other === rv) continue;
      const ahead = other.p - rv.p;
      if (ahead > 0 && ahead < 16 && Math.abs(other.d - rv.d) < 2.6) {
        targetD = other.d + (rv.d >= other.d ? 3 : -3);
      }
    }
    targetD = clamp(targetD, -this.half + 1.2, this.half - 1.2);
    rv.d += clamp(targetD - rv.d, -4 * dt, 4 * dt);
    rv.p += (rv.speed / 3.6) * dt;
    if (rv.finishTime === null && rv.p >= this.raceLength) rv.finishTime = this.time;
  }

  private resolveCollisions() {
    const pl = this.player;
    const all: Racer[] = [pl, ...this.rivals];
    const L = this.track.length;
    for (let a = 0; a < all.length; a += 1) {
      for (let b = a + 1; b < all.length; b += 1) {
        const A = all[a];
        const B = all[b];
        let ds = (A.p - B.p) % L;
        if (ds > L / 2) ds -= L;
        if (ds < -L / 2) ds += L;
        const dd = A.d - B.d;
        if (Math.abs(ds) < CAR_LENGTH && Math.abs(dd) < CAR_WIDTH) {
          const overlap = (CAR_WIDTH - Math.abs(dd)) / 2;
          const dir = dd >= 0 ? 1 : -1;
          A.d += dir * overlap;
          B.d -= dir * overlap;
          const [front, rear] = ds >= 0 ? [A, B] : [B, A];
          rear.speed = Math.min(rear.speed, front.speed * 0.96);
          if ((A === pl || B === pl) && pl.crashCooldown <= 0) {
            this.events.push({ type: 'sfx', name: 'crash' });
            pl.crashCooldown = 0.5;
          }
        }
      }
    }
  }

  hud(): Partial<HudState> {
    const pl = this.player;
    return {
      speed: Math.round(pl.speed),
      nitro: Math.round(pl.nitro * 100),
      lap: this.currentLap,
      totalLaps: this.laps,
      lapTime: this.finished || this.lapsDone < 0 ? (this.finished ? 0 : this.time) : this.time - this.lapStart,
      raceTime: pl.finishTime ?? this.time,
      bestLap: this.bestLap,
      position: this.position,
      racers: this.rivals.length + 1,
      offTrack: !this.finished && pl.offTrack,
    };
  }

  result(): CircuitResult | null {
    if (!this.finished || this.player.finishTime === null) return null;
    return {
      position: this.position,
      racers: this.rivals.length + 1,
      totalTime: this.player.finishTime,
      bestLap: this.bestLap ?? this.player.finishTime,
      bestLapSplits: this.bestLapSplits,
    };
  }
}
