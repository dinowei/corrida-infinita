import type { SkyPresetId, SkyStyle } from './types';

/**
 * Presets do céu. Paletas saturadas e LIMITADAS, no espírito de arte
 * conceitual a marcador e nanquim: poucas cores, cada faixa é uma "passada"
 * de marcador. Sombras de nuvem nunca são cinza puro: puxam para o
 * azul/violeta da paleta.
 */
export const SKY_PRESETS: Record<SkyPresetId, SkyStyle> = {
  // Cobalto profundo no zênite → ciano → horizonte claro e quente.
  'clear-day': {
    zenith: '#14309c',
    upper: '#1a7ad0',
    horizon: '#f3e6c8',
    // faixas explícitas: creme quente no chão, depois ciano/azul SATURADOS
    // (separa as montanhas lavanda do céu)
    bandPalette: ['#f3e6c8', '#4fb4e6', '#1f7fd6', '#14309c'],
    ground: '#5c5a6e',
    bands: 4,
    bandCurve: 0.6,
    sunBulge: 0.12,
    sunColor: '#fffbea',
    sunSize: 0.035,
    haloColor: '#fff0b0',
    haloStrength: 0.35,
    cloud: {
      coverage: 0.5,
      scale: 1.0,
      speed: 0.01,
      litColor: '#ffffff',
      shadowColor: '#9db0e0',
      rimColor: '#ffffff', // sem traço creme sobre o branco (lia como franja)
      altitude: [0.03, 1],
      sharpness: 0.9,
      shadowSize: 0.5,
    },
    flare: true,
  },

  // Violeta no zênite, magenta, horizonte laranja. Faixas se curvam em volta do sol.
  sunset: {
    zenith: '#3a1d72',
    upper: '#c8327c',
    horizon: '#ff8c3a',
    ground: '#2b1836',
    bands: 5,
    bandCurve: 0.55,
    sunBulge: 0.35,
    sunColor: '#fff2b8',
    sunSize: 0.055,
    haloColor: '#ffbf4a',
    haloStrength: 0.45,
    cloud: {
      coverage: 0.42,
      scale: 1.1,
      speed: 0.008,
      litColor: '#ffb070',
      shadowColor: '#6e2c74',
      rimColor: '#ffe9a6',
      altitude: [0.02, 0.8],
      sharpness: 0.9,
      shadowSize: 0.6,
    },
    flare: true,
  },

  // Ardósia dessaturada, pouco contraste entre faixas, céu bem fechado.
  'rain-light': {
    zenith: '#4b5568',
    upper: '#69748a',
    horizon: '#8e98a8',
    ground: '#3b414c',
    bands: 3,
    bandCurve: 0.7,
    sunBulge: 0.05,
    sunColor: '#e2e7ee',
    sunSize: 0.04,
    haloColor: '#b9c2cf',
    haloStrength: 0.12,
    cloud: {
      coverage: 0.72,
      scale: 1.2,
      speed: 0.02,
      litColor: '#a4adbb',
      shadowColor: '#5c6577',
      rimColor: '#c3cbd6',
      altitude: [0.0, 1],
      sharpness: 0.8,
      shadowSize: 0.6,
    },
    flare: false,
  },

  'rain-heavy': {
    zenith: '#353c4c',
    upper: '#4c5466',
    horizon: '#6c7586',
    ground: '#2c313a',
    bands: 3,
    bandCurve: 0.7,
    sunBulge: 0,
    sunColor: '#c9d0da',
    sunSize: 0.03,
    haloColor: '#8e97a6',
    haloStrength: 0.06,
    cloud: {
      coverage: 0.88,
      scale: 1.3,
      speed: 0.03,
      litColor: '#7a8394',
      shadowColor: '#424a5a',
      rimColor: '#98a1b0',
      altitude: [0.0, 1],
      sharpness: 0.75,
      shadowSize: 0.7,
    },
    flare: false,
  },

  // Neblina: tudo pálido, faixas quase iguais, nuvens tênues.
  fog: {
    zenith: '#a3afbd',
    upper: '#bfc8d1',
    horizon: '#dde2e5',
    ground: '#c6ccd2',
    bands: 3,
    bandCurve: 0.8,
    sunBulge: 0.04,
    sunColor: '#f6f4ee',
    sunSize: 0.045,
    haloColor: '#e9e8e2',
    haloStrength: 0.18,
    cloud: {
      coverage: 0.3,
      scale: 1.1,
      speed: 0.006,
      litColor: '#eef1f3',
      shadowColor: '#b7c0ca',
      rimColor: '#f8f9fa',
      altitude: [0.05, 1],
      sharpness: 0.6,
      shadowSize: 0.4,
    },
    flare: false,
  },

  // Tempestade: azul-violeta escuro, massa de nuvens quase total e pesada.
  storm: {
    zenith: '#1b1f2e',
    upper: '#2c3146',
    horizon: '#4f5470',
    ground: '#1c1f28',
    bands: 4,
    bandCurve: 0.65,
    sunBulge: 0,
    sunColor: '#c8cde0',
    sunSize: 0.03,
    haloColor: '#6b7090',
    haloStrength: 0.0,
    cloud: {
      coverage: 0.92,
      scale: 1.3,
      speed: 0.035,
      litColor: '#5d6380',
      shadowColor: '#252939',
      rimColor: '#9097b4',
      altitude: [0.0, 1],
      sharpness: 0.85,
      shadowSize: 0.8,
    },
    flare: false,
  },

  // Neve: azul-gelo claro, nuvens brancas com sombra lavanda.
  snow: {
    zenith: '#7f9cc4',
    upper: '#b2c4dc',
    horizon: '#e8eef5',
    ground: '#d9e1ec',
    bands: 4,
    bandCurve: 0.65,
    sunBulge: 0.08,
    sunColor: '#ffffff',
    sunSize: 0.04,
    haloColor: '#eef3ff',
    haloStrength: 0.25,
    cloud: {
      coverage: 0.6,
      scale: 1.1,
      speed: 0.012,
      litColor: '#ffffff',
      shadowColor: '#a8b4d0',
      rimColor: '#ffffff',
      altitude: [0.02, 1],
      sharpness: 0.85,
      shadowSize: 0.55,
    },
    flare: false,
  },

  // Espaço: índigo quase preto, estrelas, nebulosa em 2 tons e 2 planetas cel.
  space: {
    zenith: '#05040f',
    upper: '#0e0a28',
    horizon: '#211852',
    ground: '#07060f',
    bands: 3,
    bandCurve: 0.5,
    sunBulge: 0.0,
    sunColor: '#fff8f0',
    sunSize: 0.025,
    haloColor: '#b8a8ff',
    haloStrength: 0.25,
    cloud: {
      coverage: 0,
      scale: 1,
      speed: 0,
      litColor: '#ffffff',
      shadowColor: '#000000',
      rimColor: '#ffffff',
      altitude: [0, 1],
      sharpness: 1,
    },
    flare: true,
    stars: { density: 0.2, brightness: 1.2 },
    nebula: { colorA: '#6a2aa8', colorB: '#2a9fb8', intensity: 0.2 },
    planets: [
      {
        dir: [-0.62, 0.32, -0.72],
        size: 0.16,
        color: '#f28a4a',
        shadowColor: '#5a2450',
        ring: true,
        ringColor: '#f6d29a',
      },
      {
        dir: [0.55, 0.48, -0.68],
        size: 0.05,
        color: '#7fe3d6',
        shadowColor: '#22476e',
      },
    ],
  },
};

export const SKY_PRESET_IDS = Object.keys(SKY_PRESETS) as SkyPresetId[];

/**
 * Escolhe o preset a partir do clima e da hora do dia.
 *
 * @param weatherId id do clima do jogo ('clear', 'rain') ou diretamente um id
 *   de preset ('rain-heavy', 'fog', 'storm', 'snow', 'space', ...).
 * @param timeOfDay hora em [0, 24). Só afeta o céu limpo:
 *   amanhecer (5h–7h30) e entardecer (17h–19h30) → 'sunset';
 *   noite (19h30–5h) → 'space' (céu estrelado); resto → 'clear-day'.
 */
export function presetFor(weatherId: string, timeOfDay = 12): SkyPresetId {
  const h = ((timeOfDay % 24) + 24) % 24;
  switch (weatherId) {
    case 'clear':
    case 'clear-day':
    case 'sunset': {
      if (weatherId === 'sunset') return 'sunset';
      if ((h >= 5 && h < 7.5) || (h >= 17 && h < 19.5)) return 'sunset';
      if (h >= 19.5 || h < 5) return 'space';
      return 'clear-day';
    }
    case 'rain':
    case 'rain-light':
      return 'rain-light';
    case 'rain-heavy':
    case 'fog':
    case 'storm':
    case 'snow':
    case 'space':
      return weatherId;
    default:
      return 'clear-day';
  }
}
