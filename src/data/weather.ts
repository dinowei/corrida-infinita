import type { WeatherDefinition, WeatherId } from '../game/contracts';

export const WEATHER: Record<WeatherId, WeatherDefinition> = {
  clear: {
    id: 'clear',
    name: 'Céu limpo',
    description: 'Asfalto seco, visibilidade total.',
    grip: 1,
    braking: 1,
    skyPreset: 'clear-day',
    // Névoa no tom do horizonte do céu: o cenário distante "entra" no céu.
    fog: { color: '#e9e6d6', near: 260, far: 1700 },
    light: {
      // Sol atrás e à direita da câmera na reta principal: o jogador vê o lado iluminado.
      sunDir: [0.5, 0.62, 0.6],
      sun: '#fff6e2',
      shadowTint: '#5547a6',
      skyAmbient: '#9fd0ff',
      groundAmbient: '#6d5c86',
      rim: '#fff2c8',
      ink: '#0d0b1e',
      reflectSky: '#9fd8ff',
      reflectHorizon: '#ffffff',
      reflectGround: '#3a3460',
    },
    rain: 0,
    wetness: 0,
  },
  rain: {
    id: 'rain',
    name: 'Chuva leve',
    description: 'Pista molhada: menos aderência e frenagem, névoa a 300 m.',
    grip: 0.8,
    braking: 0.78,
    skyPreset: 'rain-light',
    fog: { color: '#8e98a8', near: 40, far: 340 },
    light: {
      sunDir: [0.3, 0.8, 0.5],
      sun: '#c9d3e2',
      shadowTint: '#3b4566',
      skyAmbient: '#8696b3',
      groundAmbient: '#3f4458',
      rim: '#cfe0f5',
      ink: '#10131f',
      reflectSky: '#a8b6cc',
      reflectHorizon: '#e3e9f2',
      reflectGround: '#2a2f40',
    },
    rain: 0.6,
    wetness: 0.85,
  },
};

export const WEATHER_LIST = Object.values(WEATHER);
