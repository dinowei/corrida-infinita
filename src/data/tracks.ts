import type { TrackDefinition } from '../game/contracts';

export const TRACKS: TrackDefinition[] = [
  {
    id: 'costa-neon',
    name: 'Viaduto Costa Neon',
    version: 1,
    laps: 3,
    width: 15,
    scale: 1.25,
    seed: 1337,
    defaultBiome: 'costa-neon',
    points: [
      [0, 0, 0],
      [0, 0, -200],
      [20, 2, -320],
      [90, 6, -380],
      [180, 9, -370],
      [230, 7, -300],
      [220, 4, -200],
      [160, 1, -150],
      [140, 0, -80],
      [190, 2, -10],
      [260, 6, 40],
      [270, 9, 130],
      [210, 7, 190],
      [120, 4, 205],
      [50, 1, 150],
      [8, 0, 80],
    ],
    // Três setores: grampo norte, chicane central e curva leste.
    checkpoints: [
      { id: 'grampo', at: 0.33 },
      { id: 'chicane', at: 0.62 },
    ],
  },
];
