import { clamp, PLAYER_LIMIT, ROAD_WIDTH } from '../../lib/game';
import type { ControlState, HudState } from '../../types/game';
import type { RaceEvent, RaceSession, WeatherDefinition } from '../contracts';
import type { VehicleSpec } from '../vehicles';
import { seededRandom } from '../world/generator';

/**
 * Simulação do modo Infinito: estrada de três faixas com curvatura visual,
 * tráfego reciclado, quase-acidentes e integridade. Sem React e sem Three —
 * o tráfego vem de um RNG com semente, então a mesma seed + mesma entrada
 * produzem a mesma corrida.
 */

export const LANE_WIDTH = ROAD_WIDTH / 3;
export const TRAFFIC_SLOTS = 8;
const TRAFFIC_COLORS = ['#f97316', '#38bdf8', '#ef4444', '#84cc16', '#eab308'];
const HULL_HIT = 34;

export type TrafficCar = { lane: number; z: number; speed: number; color: string; active: boolean };

export type InfiniteResult = { score: number; distance: number };

export function getLaneX(lane: number) {
  return (lane - 1) * LANE_WIDTH;
}

/** Deslocamento lateral da "curva" da estrada numa distância. */
export function getCurveOffset(distance: number) {
  return Math.sin(distance / 140) * 1.05 + Math.sin(distance / 58) * 0.42;
}

/** Suavização independente da taxa de quadros. */
const approach = (current: number, target: number, rate: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-rate * dt));

export class InfiniteSession implements RaceSession<InfiniteResult> {
  readonly vehicle: VehicleSpec;
  readonly weather: WeatherDefinition;
  carX = 0;
  speed = 0;
  distance = 0;
  curve = 0;
  nitro = 1;
  nitroActive = false;
  score = 0;
  hull = 100;
  /** inclinação longitudinal derivada da aceleração, para o render */
  accelPitch = 0;
  /** metros percorridos no último update, para mover marcações da pista */
  roadFlow = 0;
  traffic: TrafficCar[];
  private cooldown = 0;
  private over = false;
  private rand: () => number;
  private events: RaceEvent[] = [];

  constructor(config: { vehicle: VehicleSpec; weather: WeatherDefinition; seed: number }) {
    this.vehicle = config.vehicle;
    this.weather = config.weather;
    this.rand = seededRandom(config.seed);
    this.traffic = Array.from({ length: TRAFFIC_SLOTS }, (_, i) => ({
      lane: i % 3,
      z: -40 - i * 24,
      speed: 88 + i * 6,
      color: TRAFFIC_COLORS[i % TRAFFIC_COLORS.length],
      active: i < 3,
    }));
  }

  get finished() {
    return this.over;
  }

  get totalScore() {
    return Math.max(0, Math.round(this.score + this.distance));
  }

  drainEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }

  trafficX(car: TrafficCar) {
    return getLaneX(car.lane) + getCurveOffset(this.distance - car.z * 4.2) * 0.72;
  }

  private difficulty() {
    const distanceFactor = clamp(this.distance / 1800, 0, 1);
    const speedFactor = clamp(this.speed / 248, 0, 1);
    return clamp(distanceFactor * 0.72 + speedFactor * 0.28, 0, 1);
  }

  private chooseLane(playerLane: number, spawnZ: number) {
    const lanes = [0, 1, 2];
    for (let i = lanes.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.rand() * (i + 1));
      [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
    }
    for (const lane of lanes) {
      const busy = this.traffic.some((c) => c.active && c.lane === lane && Math.abs(c.z - spawnZ) < 20);
      const blocksPlayer = lane === playerLane && spawnZ > -65;
      if (!busy && !blocksPlayer) return lane;
    }
    return lanes[0];
  }

  private respawn(car: TrafficCar, index: number, difficulty: number, playerLane: number) {
    const spacing = 34 - difficulty * 12;
    const spawnZ = -110 - index * spacing - this.rand() * (30 + difficulty * 35);
    car.active = true;
    car.z = spawnZ;
    car.lane = this.chooseLane(playerLane, spawnZ);
    car.speed = 74 + difficulty * 42 + this.rand() * (18 + difficulty * 14);
    car.color = TRAFFIC_COLORS[(index + Math.floor(this.rand() * TRAFFIC_COLORS.length)) % TRAFFIC_COLORS.length];
  }

  update(dt: number, input: ControlState, racing: boolean) {
    const spec = this.vehicle;
    const running = racing && !this.over;
    const previousSpeed = this.speed;
    this.nitroActive = running && input.nitro && this.nitro > 0.02;
    const playerLane = clamp(Math.round(this.carX / LANE_WIDTH) + 1, 0, 2);

    if (running) {
      this.speed += (17 + spec.accel * 0.68 * input.throttle) * dt;
      this.speed -= spec.brake * 0.8 * this.weather.braking * input.brake * dt;
      this.speed -= 10.5 * dt;
      if (this.nitroActive) {
        this.nitro = Math.max(0, this.nitro - dt * spec.nitroBurn);
        this.speed += 82 * dt;
      } else {
        this.nitro = Math.min(1, this.nitro + dt * 0.045);
      }
      const cap = this.nitroActive ? spec.nitroSpeed : spec.topSpeed;
      if (this.speed > cap) this.speed = Math.max(cap, this.speed - 60 * dt);
      this.speed = Math.max(0, this.speed);
      this.distance += (this.speed / 3.6) * dt;
      this.score += (this.speed / 3.6) * dt * (this.nitroActive ? 0.55 : 0.35);
      this.curve = approach(this.curve, getCurveOffset(this.distance) * 0.75, 2.76, dt);
      const grip = spec.grip * this.weather.grip;
      this.carX = clamp(
        this.carX +
          input.steer * dt * (2.35 + this.speed / 58) * spec.handling -
          (this.curve * dt * (0.42 + this.speed / 420)) / grip,
        -PLAYER_LIMIT,
        PLAYER_LIMIT,
      );
    } else {
      this.speed = approach(this.speed, 0, this.over ? 1.83 : 5, dt);
      this.curve = approach(this.curve, 0, 5, dt);
    }

    this.accelPitch = clamp((this.speed - previousSpeed) / Math.max(dt, 0.0001) / 900, -0.065, 0.06);
    this.roadFlow = (this.speed / 3.6) * dt;

    const difficulty = this.difficulty();
    const targetCount = 3 + Math.floor(difficulty * 5);
    this.traffic.forEach((car, index) => {
      if (!car.active && index < targetCount) this.respawn(car, index, difficulty, playerLane);
      else if (car.active && index >= targetCount) car.active = false;
    });

    this.traffic.forEach((car, index) => {
      if (!car.active) return;
      car.z += ((this.speed - car.speed) / 3.6) * dt * 1.05;
      if (car.z > 16) this.respawn(car, index, difficulty, playerLane);
      if (!running) return;

      const dx = Math.abs(this.trafficX(car) - this.carX);
      if (Math.abs(car.z) < 2.6 && dx < 1.15 && this.cooldown <= 0) {
        this.speed = Math.max(38, this.speed * 0.62);
        this.score = Math.max(0, this.score - 25);
        this.hull = Math.max(0, this.hull - HULL_HIT);
        this.cooldown = 1.1;
        this.events.push({ type: 'sfx', name: 'crash' });
        this.events.push({
          type: 'toast',
          text: this.hull > 0 ? `Batida! Integridade ${Math.round(this.hull)}%` : 'Destruído!',
        });
      } else if (Math.abs(car.z) < 4.2 && dx < 2.05 && dx > 1.15 && this.cooldown <= 0) {
        this.score += 18;
        this.nitro = Math.min(1, this.nitro + 0.06);
        this.cooldown = 0.35;
        this.events.push({ type: 'sfx', name: 'nearMiss' });
      }
    });

    this.cooldown = Math.max(0, this.cooldown - dt);
    if (!this.over && this.hull <= 0) this.over = true;
  }

  hud(): Partial<HudState> {
    return {
      speed: Math.round(this.speed),
      distance: Math.round(this.distance),
      nitro: Math.round(this.nitro * 100),
      score: this.totalScore,
      hull: Math.round(this.hull),
    };
  }

  result(): InfiniteResult | null {
    return this.over ? { score: this.totalScore, distance: Math.round(this.distance) } : null;
  }
}
