import type { VehicleId } from '../types/game';
import type { VehicleClass } from './contracts';

export type VehicleSpec = {
  id: VehicleId;
  name: string;
  tagline: string;
  class: VehicleClass;
  kind: 'car' | 'hover';
  /** km/h */
  topSpeed: number;
  nitroSpeed: number;
  /** km/h por segundo com acelerador cheio */
  accel: number;
  brake: number;
  /** multiplicador de resposta lateral */
  handling: number;
  /** quanto resiste a ser empurrado para fora nas curvas (0..1+) */
  grip: number;
  /** consumo de nitro por segundo (fração do tanque) */
  nitroBurn: number;
  /** pintura principal, secundária e cor do brilho dos propulsores */
  colors: { body: string; accent: string; stripe: string; glow: string };
};

export const VEHICLES: Record<VehicleId, VehicleSpec> = {
  gtr: {
    id: 'gtr',
    name: 'GT-R R35',
    tagline: 'Equilibrado, pneus de verdade.',
    class: 'balanced',
    kind: 'car',
    topSpeed: 248,
    nitroSpeed: 315,
    accel: 54,
    brake: 90,
    handling: 1,
    grip: 1,
    nitroBurn: 0.38,
    colors: { body: '#c8102e', accent: '#111827', stripe: '#f8fafc', glow: '#ff5f5f' },
  },
  aurora: {
    id: 'aurora',
    name: 'Aurora RE-0',
    class: 'light',
    tagline: 'Hover leve: vira muito, desliza mais.',
    kind: 'hover',
    topSpeed: 262,
    nitroSpeed: 340,
    accel: 50,
    brake: 70,
    handling: 1.3,
    grip: 0.78,
    nitroBurn: 0.42,
    colors: { body: '#dfe3ee', accent: '#1f5fa8', stripe: '#d7263d', glow: '#ff4fd8' },
  },
  vespa: {
    id: 'vespa',
    name: 'Vespa MX-05',
    class: 'heavy',
    tagline: 'Hover pesado: nitro brutal, curva larga.',
    kind: 'hover',
    topSpeed: 240,
    nitroSpeed: 360,
    accel: 62,
    brake: 64,
    handling: 0.92,
    grip: 0.9,
    nitroBurn: 0.3,
    colors: { body: '#f5a524', accent: '#9b3fb5', stripe: '#1f2937', glow: '#5ee7ff' },
  },
};

export const VEHICLE_LIST = Object.values(VEHICLES);

/** Valores 0..1 para as barras do menu. */
export function vehicleRatings(v: VehicleSpec) {
  return {
    velocidade: (v.topSpeed - 220) / 60,
    aceleração: (v.accel - 40) / 30,
    controle: (v.handling * v.grip - 0.7) / 0.6,
    nitro: (v.nitroSpeed - v.topSpeed - 50) / 80,
  };
}
