import type { BiomeDefinition, BiomeId } from '../game/contracts';

export const BIOMES: Record<BiomeId, BiomeDefinition> = {
  'costa-neon': {
    id: 'costa-neon',
    name: 'Costa Neon',
    ground: '#5d8a4a',
    trees: ['#1f5130', '#24603a', '#2f6e3b', '#1b4a2f', '#3a7a3f'],
    buildings: ['#e8ecf2', '#d5dbe4', '#c3ccd8', '#f1efe9', '#b8c3d1'],
    mountains: '#6f86a6',
    density: { trees: 650, buildings: 90, mountains: 26 },
  },
};
