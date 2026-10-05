import { describe, expect, it } from 'vitest';
import { BIOMES } from '../../data/biomes';
import { RIVALS } from '../../data/rivals';
import { WEATHER } from '../../data/weather';
import type { WeatherId } from '../contracts';
import { circuitAutopilot } from '../ai/autopilot';
import { CircuitSession } from '../modes/circuitSession';
import { InfiniteSession } from '../modes/infiniteSession';
import { migrate } from '../save';
import { getTrack } from '../tracks';
import { VEHICLES } from '../vehicles';
import { GENERATOR_VERSION, raceKey } from '../world/generator';
import { buildScenery, distanceToTrackSq } from '../world/scenery';

const DT = 1 / 30;

const autopilot = circuitAutopilot;

function runRace(weather: WeatherId = 'clear', vehicle: keyof typeof VEHICLES = 'gtr') {
  const session = new CircuitSession({
    track: getTrack(),
    vehicle: VEHICLES[vehicle],
    weather: WEATHER[weather],
    rivals: RIVALS,
  });
  const events: string[] = [];
  for (let i = 0; i < 30 * 400 && !session.finished; i += 1) {
    session.update(DT, autopilot(session), true);
    for (const e of session.drainEvents()) if (e.type === 'toast') events.push(e.text);
  }
  return { session, result: session.result(), events };
}

describe('Circuito', () => {
  it('completa 3 voltas e produz resultado', () => {
    const { result, session } = runRace();
    expect(session.finished).toBe(true);
    expect(result).not.toBeNull();
    expect(result!.totalTime).toBeGreaterThan(60);
    expect(result!.totalTime).toBeLessThan(180);
    expect(result!.position).toBeGreaterThanOrEqual(1);
    expect(result!.position).toBeLessThanOrEqual(RIVALS.length + 1);
  });

  it('é determinístico: mesma entrada, mesmo resultado', () => {
    const a = runRace().result!;
    const b = runRace().result!;
    expect(a).toEqual(b);
  });

  it('registra os setores na ordem antes de cada volta', () => {
    const { events, result } = runRace();
    const track = getTrack();
    const sectors = events.filter((e) => e.startsWith('Setor'));
    // checkpoints intermediários × voltas
    expect(sectors.length).toBe(track.def.checkpoints.length * track.def.laps);
    expect(result!.bestLapSplits).toHaveLength(track.def.checkpoints.length);
    const firstLap = events.findIndex((e) => e.startsWith('Volta 2'));
    expect(events.slice(0, firstLap).filter((e) => e.startsWith('Setor'))).toEqual([
      expect.stringMatching(/^Setor 1/),
      expect.stringMatching(/^Setor 2/),
    ]);
  });

  it('não conta volta ao saltar direto para a linha: passa por todos os checkpoints antes', () => {
    const session = new CircuitSession({ track: getTrack(), vehicle: VEHICLES.gtr, weather: WEATHER.clear, rivals: [] });
    session.update(DT, { steer: 0, throttle: 0, brake: 0, nitro: false }, true);
    session.drainEvents();
    // Um "atalho" que leva o carro direto para depois da linha na volta 1.
    session.player.p = session.track.length + 1;
    session.update(DT, { steer: 0, throttle: 0, brake: 0, nitro: false }, true);
    const texts = session
      .drainEvents()
      .filter((e) => e.type === 'toast')
      .map((e) => (e as { text: string }).text);
    expect(texts[0]).toMatch(/^Setor 1/);
    expect(texts[1]).toMatch(/^Setor 2/);
    expect(texts[2]).toMatch(/^Volta 2/);
  });

  it('chuva reduz a aderência e deixa a corrida mais lenta', () => {
    const clear = runRace('clear').result!;
    const rain = runRace('rain').result!;
    // Pelo menos 3% mais lenta: o clima precisa pesar na corrida, não só no visual.
    expect(rain.totalTime).toBeGreaterThan(clear.totalTime * 1.03);
  });

  it('veículos têm comportamento diferente', () => {
    const gtr = runRace('clear', 'gtr').result!;
    const vespa = runRace('clear', 'vespa').result!;
    expect(gtr.totalTime).not.toBeCloseTo(vespa.totalTime, 1);
  });
});

describe('Infinito', () => {
  const play = (seed: number) => {
    const s = new InfiniteSession({ vehicle: VEHICLES.aurora, weather: WEATHER.clear, seed });
    for (let i = 0; i < 30 * 60 && !s.finished; i += 1) {
      s.update(DT, { steer: Math.sin(i / 40), throttle: 1, brake: 0, nitro: i % 300 < 60 }, true);
    }
    return { score: s.totalScore, distance: Math.round(s.distance), hull: s.hull, lanes: s.traffic.map((t) => t.lane) };
  };

  it('mesma seed reproduz a mesma corrida', () => {
    expect(play(42)).toEqual(play(42));
  });

  it('seeds diferentes geram tráfego diferente', () => {
    expect(play(42)).not.toEqual(play(7));
  });
});

describe('Mundo procedural', () => {
  const track = getTrack();
  const biome = BIOMES[track.def.defaultBiome];

  it('a mesma seed gera o mesmo cenário', () => {
    const a = buildScenery(track, biome);
    const b = buildScenery(track, biome);
    expect(a.trees.map((m) => m.elements.join())).toEqual(b.trees.map((m) => m.elements.join()));
    expect(a.trees.length).toBeGreaterThan(biome.density.trees * 0.5);
  });

  it('nenhuma árvore ou rocha fica sobre a pista', () => {
    const { trees, rocks } = buildScenery(track, biome);
    const minClear = track.def.width / 2 + 2.5;
    expect(rocks.length).toBeGreaterThan(50);
    for (const m of [...trees, ...rocks]) {
      const x = m.elements[12];
      const z = m.elements[14];
      expect(Math.sqrt(distanceToTrackSq(track, x, z))).toBeGreaterThan(minClear);
    }
  });

  it('a chave da corrida inclui a versão do gerador', () => {
    const key = raceKey({ trackId: 'costa-neon', trackVersion: 1, biome: 'costa-neon', weather: 'rain', seed: 1337 });
    expect(key).toContain(`g${GENERATOR_VERSION}`);
    expect(key).toContain('rain');
  });
});

describe('Save', () => {
  it('migra o save v1 (só recorde)', () => {
    const blob = migrate({ version: 1, best: 1234 });
    expect(blob.bestScore).toBe(1234);
    expect(blob.settings.weather).toBe('clear');
  });

  it('migra recordes v2 por pista para a chave de corrida', () => {
    const blob = migrate({ version: 2, bestScore: 10, tracks: { 'costa-neon': { bestLap: 27.4, bestTotal: 86.9 } } });
    const record = Object.values(blob.records)[0];
    expect(record.bestLap).toBe(27.4);
    expect(record.bestTotal).toBe(86.9);
  });

  it('ignora lixo sem quebrar', () => {
    expect(migrate('lixo').bestScore).toBe(0);
    expect(migrate({ records: { x: { bestLap: -1 } } }).records.x.bestLap).toBeNull();
  });
});
