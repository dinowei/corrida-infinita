import { describe, expect, it } from 'vitest';
import {
  CLOUD_CELL,
  CLOUD_HEIGHT,
  CLOUD_MIN_PX,
  CLOUD_ROW_GROWTH,
  CLOUD_ROWS,
  CLOUD_X_JITTER,
  cloudColumns,
  cloudMaxHalfWidth,
  cloudMaxReach,
  cloudRowBase,
  cloudRowIndex,
  cloudRowStep,
  cloudVisible,
} from '../clouds';
import { pixelAngle } from '../skyMaterial';
import { SKY_PRESETS, SKY_PRESET_IDS } from '../presets';

const scales = [0.8, 1, 1.1, 1.3, 1.6];

describe('layout das nuvens', () => {
  it('cloudRowIndex é o inverso de cloudRowBase', () => {
    for (const sc of scales) {
      for (let r = 0; r < CLOUD_ROWS; r += 1) {
        const base = cloudRowBase(r, sc, 0.02);
        const step = cloudRowStep(r, sc);
        expect(cloudRowIndex(base + step * 0.01, sc, 0.02)).toBe(r);
        expect(cloudRowIndex(base + step * 0.99, sc, 0.02)).toBe(r);
      }
      expect(cloudRowIndex(0.01, sc, 0.02)).toBe(-1);
    }
  });

  it('fileiras crescem geometricamente (horizonte = nuvens menores)', () => {
    for (let r = 1; r < CLOUD_ROWS; r += 1) {
      expect(cloudRowStep(r) / cloudRowStep(r - 1)).toBeCloseTo(CLOUD_ROW_GROWTH, 10);
    }
  });

  it('nuvem da fileira r-1 nunca alcança a fileira r+1 (basta avaliar 2 fileiras)', () => {
    for (const sc of scales) {
      for (let r = 1; r < CLOUD_ROWS; r += 1) {
        const top = cloudRowBase(r - 1, sc) + cloudMaxReach(r - 1, sc);
        expect(top).toBeLessThan(cloudRowBase(r + 1, sc));
      }
    }
  });

  it('nuvem nunca sai das células vizinhas (basta avaliar 3 células)', () => {
    for (const sc of scales) {
      for (let r = 0; r < CLOUD_ROWS; r += 1) {
        const n = cloudColumns(r, sc);
        expect(Number.isInteger(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(3);
        const base = cloudRowBase(r, sc);
        const sr = cloudRowStep(r, sc);
        // largura métrica mínima da célula em qualquer altura da nuvem
        const cellMetric = ((Math.PI * 2) / n) * Math.cos(Math.min(base + 2 * sr, Math.PI / 2 - 0.05));
        if (n > 3) expect(cellMetric).toBeGreaterThanOrEqual(CLOUD_CELL * sr * 0.999);
        // distância mínima de um pixel até o centro de uma nuvem 2 células adiante
        const minDist = (1.5 - CLOUD_X_JITTER / 2) * cellMetric;
        if (n > 3) expect(cloudMaxHalfWidth(r, sc) * 1.1).toBeLessThan(minDist);
      }
    }
  });

  it('anti-lasca: nuvens com menos de CLOUD_MIN_PX de altura são descartadas', () => {
    const px = pixelAngle(62, 720);
    expect(cloudVisible(px * (CLOUD_MIN_PX - 0.5), px)).toBe(false);
    expect(cloudVisible(px * (CLOUD_MIN_PX + 0.5), px)).toBe(true);
  });

  it.each(SKY_PRESET_IDS.filter((id) => SKY_PRESETS[id].cloud.coverage > 0))(
    '%s: a menor nuvem possível da fileira 0 é visível em 1280x720',
    (id) => {
      const c = SKY_PRESETS[id].cloud;
      const hMin = cloudRowStep(0, c.scale) * CLOUD_HEIGHT[0] * 0.75;
      expect(cloudVisible(hMin, pixelAngle(62, 720))).toBe(true);
    },
  );
});
