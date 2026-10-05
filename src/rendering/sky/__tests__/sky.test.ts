import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  bandColor,
  bandEdges,
  bandIndex,
  computeFlareState,
  hexToLinear,
  pixelAngle,
  presetFor,
  SKY_PRESETS,
  SKY_PRESET_IDS,
  sunProximity,
} from '../index';
import type { SkyStyle } from '../types';

const key = (c: number[]) => c.map((v) => v.toFixed(6)).join(',');

function distinctColors(style: SkyStyle, steps = 2000): string[] {
  const seen: string[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const k = key(bandColor(style, i / steps));
    if (seen[seen.length - 1] !== k) seen.push(k);
  }
  return seen;
}

describe('presets', () => {
  it('tem todos os ids pedidos', () => {
    expect(SKY_PRESET_IDS.sort()).toEqual(
      ['clear-day', 'fog', 'rain-heavy', 'rain-light', 'snow', 'space', 'storm', 'sunset'].sort(),
    );
  });

  it.each(SKY_PRESET_IDS)('%s: cores válidas e parâmetros no intervalo', (id) => {
    const s = SKY_PRESETS[id];
    for (const c of [s.zenith, s.upper, s.horizon, s.ground, s.sunColor, s.haloColor, s.cloud.litColor, s.cloud.shadowColor, s.cloud.rimColor]) {
      expect(() => hexToLinear(c)).not.toThrow();
    }
    expect(s.bands).toBeGreaterThanOrEqual(3);
    expect(s.bands).toBeLessThanOrEqual(5);
    expect(s.cloud.coverage).toBeGreaterThanOrEqual(0);
    expect(s.cloud.coverage).toBeLessThanOrEqual(1);
    expect(s.cloud.altitude[0]).toBeLessThan(s.cloud.altitude[1]);
    expect((s.planets ?? []).length).toBeLessThanOrEqual(2);
  });

  it('space tem estrelas, nebulosa e 2 planetas, um com anel', () => {
    const s = SKY_PRESETS.space;
    expect(s.stars).toBeDefined();
    expect(s.nebula).toBeDefined();
    expect(s.planets).toHaveLength(2);
    expect(s.planets!.some((p) => p.ring)).toBe(true);
  });
});

describe('gradiente em faixas', () => {
  it.each(SKY_PRESET_IDS)('%s: exatamente `bands` cores chapadas acima do horizonte, em ordem', (id) => {
    const s = SKY_PRESETS[id];
    const colors = distinctColors(s);
    expect(colors).toHaveLength(s.bands);
    // índices crescem monotonicamente com a elevação
    let last = -1;
    for (let i = 0; i <= 200; i += 1) {
      const b = bandIndex(s, i / 200);
      expect(b).toBeGreaterThanOrEqual(last);
      last = b;
    }
    expect(bandIndex(s, 0)).toBe(0);
    expect(bandIndex(s, 1)).toBe(s.bands - 1);
  });

  it('bordas duras: cor muda de uma vez na fronteira, sem passos intermediários', () => {
    const s = SKY_PRESETS['clear-day'];
    const edges = bandEdges(s);
    expect(edges).toHaveLength(s.bands - 1);
    edges.forEach((e, k) => {
      const below = bandColor(s, e - 1e-6);
      const above = bandColor(s, e + 1e-6);
      expect(key(below)).not.toBe(key(above));
      expect(bandIndex(s, e - 1e-6)).toBe(k);
      expect(bandIndex(s, e + 1e-6)).toBe(k + 1);
      // dentro da faixa a cor é constante
      const lo = k === 0 ? 0 : edges[k - 1];
      expect(key(bandColor(s, lo + (e - lo) * 0.2))).toBe(key(bandColor(s, lo + (e - lo) * 0.8)));
    });
  });

  it('faixa de baixo = horizonte e de cima = zênite; abaixo do horizonte = chão', () => {
    const s = SKY_PRESETS.sunset;
    expect(key(bandColor(s, 0.0001))).toBe(key(hexToLinear(s.horizon)));
    expect(key(bandColor(s, 1))).toBe(key(hexToLinear(s.zenith)));
    expect(key(bandColor(s, -0.2))).toBe(key(hexToLinear(s.ground)));
  });

  it('o bojo do sol empurra as faixas do horizonte para cima perto do sol', () => {
    const s = SKY_PRESETS.sunset;
    const e = bandEdges(s)[0] + 0.01; // logo acima da 1ª fronteira
    expect(bandIndex(s, e, 0)).toBe(1);
    expect(bandIndex(s, e, sunProximity(1))).toBe(0);
  });

  it('faixas mais finas perto do horizonte (curva < 1)', () => {
    const edges = bandEdges(SKY_PRESETS['clear-day']);
    const widths = edges.map((e, i) => e - (i === 0 ? 0 : edges[i - 1]));
    for (let i = 1; i < widths.length; i += 1) expect(widths[i]).toBeGreaterThan(widths[i - 1]);
  });
});

describe('presetFor', () => {
  it('mapeia clima e hora', () => {
    expect(presetFor('clear', 12)).toBe('clear-day');
    expect(presetFor('clear', 18)).toBe('sunset');
    expect(presetFor('clear', 6)).toBe('sunset');
    expect(presetFor('clear', 23)).toBe('space');
    expect(presetFor('clear', -1)).toBe('space');
    expect(presetFor('rain', 12)).toBe('rain-light');
    expect(presetFor('rain', 18)).toBe('rain-light');
    expect(presetFor('storm')).toBe('storm');
    expect(presetFor('snow')).toBe('snow');
    expect(presetFor('fog')).toBe('fog');
    expect(presetFor('rain-heavy')).toBe('rain-heavy');
    expect(presetFor('space')).toBe('space');
    expect(presetFor('desconhecido')).toBe('clear-day');
  });
});

describe('reflexo de lente', () => {
  function cam() {
    const c = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 600);
    c.position.set(0, 2, 0);
    c.lookAt(0, 2, -10);
    c.updateMatrixWorld();
    return c;
  }

  it('sol à frente e no centro → visível perto do centro da tela', () => {
    const s = computeFlareState(new THREE.Vector3(0, 0.2, -1).normalize(), cam());
    expect(s.fade).toBeGreaterThan(0.9);
    expect(Math.abs(s.ndc.x)).toBeLessThan(0.01);
    expect(s.ndc.y).toBeGreaterThan(0);
  });

  it('sol atrás da câmera ou abaixo do horizonte → invisível', () => {
    expect(computeFlareState(new THREE.Vector3(0, 0.2, 1).normalize(), cam()).fade).toBe(0);
    expect(computeFlareState(new THREE.Vector3(0, -0.05, -1).normalize(), cam()).fade).toBe(0);
  });

  it('sol fora da tela → invisível', () => {
    expect(computeFlareState(new THREE.Vector3(1, 0.2, -0.3).normalize(), cam()).fade).toBe(0);
  });
});

describe('pixelAngle', () => {
  it('fov 62° em 720 px ≈ 0.0017 rad', () => {
    expect(pixelAngle(62, 720)).toBeCloseTo((2 * Math.tan((31 * Math.PI) / 180)) / 720, 8);
  });
});

describe('paleta explícita de faixas', () => {
  it('clear-day usa bandPalette (uma cor por faixa, de baixo para cima)', () => {
    const s = SKY_PRESETS['clear-day'];
    expect(s.bandPalette).toHaveLength(s.bands);
    const edges = [0, ...bandEdges(s), 1];
    s.bandPalette!.forEach((hex, i) => {
      const mid = (edges[i] + edges[i + 1]) / 2;
      expect(key(bandColor(s, mid))).toBe(key(hexToLinear(hex)));
    });
  });

  it('paleta com tamanho errado é ignorada (volta para a rampa)', () => {
    const s = { ...SKY_PRESETS['clear-day'], bandPalette: ['#ff0000'] };
    expect(key(bandColor(s, 1))).toBe(key(hexToLinear(s.zenith)));
  });

  it.each(SKY_PRESET_IDS)('%s: bandPalette, se existir, tem `bands` cores válidas', (id) => {
    const s = SKY_PRESETS[id];
    if (!s.bandPalette) return;
    expect(s.bandPalette).toHaveLength(s.bands);
    for (const c of s.bandPalette) expect(() => hexToLinear(c)).not.toThrow();
  });
});
