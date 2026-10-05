import type { Livery } from '../game/contracts';

export type RivalDefinition = {
  name: string;
  /** 0.9..1.05 — ritmo geral */
  skill: number;
  topSpeed: number;
  accel: number;
  /** preferência lateral (-1 esquerda, 1 direita) */
  bias: number;
  livery: Livery;
};

export const RIVALS: RivalDefinition[] = [
  {
    name: 'MAKO',
    skill: 0.98,
    topSpeed: 252,
    accel: 50,
    bias: -0.6,
    livery: { body: '#c8202f', accent: '#2a2f3a', stripe: '#f4f4f4', glow: '#ffb347' },
  },
  {
    name: 'RIVIERA',
    skill: 1.0,
    topSpeed: 246,
    accel: 56,
    bias: 0.5,
    livery: { body: '#e3e6ef', accent: '#0f2c5c', stripe: '#e0262f', glow: '#5ad1ff' },
  },
  {
    name: 'GRAFFITI',
    skill: 0.94,
    topSpeed: 256,
    accel: 46,
    bias: 0,
    livery: { body: '#ffb000', accent: '#7b2d8e', stripe: '#f5f5f5', glow: '#d06bff' },
  },
];
