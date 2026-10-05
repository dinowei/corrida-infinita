import type { BiomeDefinition, BiomeId } from '../game/contracts';

export const BIOMES: Record<BiomeId, BiomeDefinition> = {
  /**
   * Costa Neon: viaduto litorâneo ensolarado. Paleta de marcador — asfalto
   * índigo, grama verde-limão, concreto lavanda, prédios em tons pastel
   * quentes e montanhas azul-violeta. Nada de cinza neutro: até o "cinza"
   * puxa para o violeta da sombra.
   */
  'costa-neon': {
    id: 'costa-neon',
    name: 'Costa Neon',
    palette: {
      ground: '#74b04c',
      groundTones: ['#5f9a45', '#8cc25a', '#a7c96a'],
      rock: '#8c86b8',
      // Asfalto em valor médio: a tinta preta dos veículos precisa contrastar com ele.
      road: '#545985',
      roadDetail: '#4a4f79',
      lineYellow: '#ffc93c',
      lineWhite: '#f6f1e6',
      curbA: '#ef3b4f',
      curbB: '#f6f1e6',
      shoulder: '#6f6d92',
      barrier: '#ddd6ee',
      deck: '#a99fcc',
      pillar: '#cfc6e6',
      metal: '#38365a',
      lampGlow: '#fff2b0',
      signBg: '#22213a',
      signArrow: '#ff7a1a',
      trees: ['#2f9a5b', '#43ad4f', '#1f7a57', '#5cc04a', '#279c6e'],
      trunk: '#7a4b3a',
      // Distrito com 4 matizes (areia, coral, azul, amarelo); o acento magenta fica para placas.
      buildings: ['#f2c48d', '#e8836f', '#7fb0f0', '#f5e08a'],
      windows: ['#3f63b8', '#5a86d6', '#2d4a8f', '#8fb6ff'],
      mountains: '#8a96e4',
      mountainSnow: '#eef1ff',
      accent: '#ff4fd8',
    },
    density: { trees: 650, buildings: 90, mountains: 26 },
  },
};
