import type { WeatherDefinition, WeatherId } from '../game/contracts';

export const WEATHER: Record<WeatherId, WeatherDefinition> = {
  clear: {
    id: 'clear',
    name: 'Céu limpo',
    description: 'Asfalto seco, visibilidade total.',
    grip: 1,
    braking: 1,
    background: '#9cc4e8',
    fog: { color: '#a9cbe9', near: 180, far: 1500 },
    sky: { sunPosition: [0.4, 0.55, -0.6], turbidity: 4, rayleigh: 1.1, mie: 0.004 },
    light: { sun: 2.1, sunColor: '#fff1dc', ambient: 0.55, hemisphere: 0.6 },
    exposure: 0.95,
    rain: 0,
    wetness: 0,
  },
  rain: {
    id: 'rain',
    name: 'Chuva leve',
    description: 'Pista molhada: menos aderência e frenagem, névoa a 300 m.',
    grip: 0.8,
    braking: 0.78,
    background: '#6f7c8c',
    fog: { color: '#7d8996', near: 40, far: 320 },
    sky: { sunPosition: [0.2, 0.25, -0.6], turbidity: 18, rayleigh: 0.4, mie: 0.02 },
    light: { sun: 0.75, sunColor: '#d7e2ef', ambient: 0.7, hemisphere: 0.55 },
    exposure: 0.9,
    rain: 0.6,
    wetness: 0.85,
  },
};

export const WEATHER_LIST = Object.values(WEATHER);
