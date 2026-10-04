import * as THREE from 'three';
import { circuitAutopilot } from '../game/ai/autopilot';
import type { QualityLevel, WeatherId } from '../game/contracts';
import { setControlOverride } from '../game/input';
import type { CircuitSession } from '../game/modes/circuitSession';
import type { InfiniteSession } from '../game/modes/infiniteSession';
import { useGameStore } from '../game/store';
import type { ControlState, GameMode, VehicleId } from '../types/game';
import { devRig } from './cameraRig';

/**
 * API de captura usada por scripts/harness.mjs (Playwright). Só existe em dev.
 *
 * Fluxo típico: setup() → simulate(segundos) em passo fixo (determinístico,
 * independente da taxa de quadros real) → view('side') → screenshot.
 * Para medir desempenho: setup() → drive(true) → coletar frame time real.
 */

type RootState = {
  setFrameloop: (mode: 'always' | 'demand' | 'never') => void;
  advance: (timestamp: number, runGlobalEffects?: boolean) => void;
  clock: THREE.Clock;
  camera: THREE.Camera;
  gl: THREE.WebGLRenderer;
};

declare global {
  interface Window {
    __game?: { get: () => RootState };
    __race?: CircuitSession | InfiniteSession;
    __harness?: typeof harness;
  }
}

const VIEWS = ['chase', 'side', 'front', 'rear', 'top', 'wide', 'low'] as const;
export type HarnessView = (typeof VIEWS)[number];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function root(): RootState {
  const g = window.__game;
  if (!g) throw new Error('cena 3D ainda não montada');
  return g.get();
}

function isCircuit(s: unknown): s is CircuitSession {
  return Boolean(s && typeof s === 'object' && 'rivals' in s);
}

function controlsFor(session: CircuitSession | InfiniteSession | undefined): ControlState {
  if (isCircuit(session)) return circuitAutopilot(session);
  // Infinito: acelera e desvia do carro mais próximo à frente na mesma faixa.
  const s = session as InfiniteSession | undefined;
  if (!s) return { steer: 0, throttle: 1, brake: 0, nitro: false };
  const ahead = s.traffic
    .filter((c) => c.active && c.z < 2 && c.z > -40)
    .sort((a, b) => b.z - a.z)[0];
  let steer = 0;
  if (ahead && Math.abs(s.trafficX(ahead) - s.carX) < 1.6) steer = s.trafficX(ahead) > s.carX ? -1 : 1;
  return { steer, throttle: 1, brake: 0, nitro: s.nitro > 0.6 };
}

let driving = 0;

const harness = {
  views: VIEWS,

  /** Monta uma corrida e pula a contagem. Resolve quando a cena está pronta. */
  async setup(config: { mode?: GameMode; vehicle?: VehicleId; weather?: WeatherId; quality?: QualityLevel } = {}) {
    const store = useGameStore.getState();
    if (config.mode) store.setMode(config.mode);
    if (config.vehicle) store.setVehicle(config.vehicle);
    if (config.weather) store.setWeather(config.weather);
    if (config.quality) store.setQuality(config.quality);
    devRig.override.active = false;
    store.newRun();
    store.setPhase('countdown');
    for (let i = 0; i < 600 && !useGameStore.getState().sceneReady; i += 1) await wait(50);
    if (!useGameStore.getState().sceneReady) throw new Error('cena não ficou pronta em 30 s');
    store.setCountdown('');
    store.setPhase('running');
    return { ok: true };
  },

  /** Avança a simulação `seconds` em passos fixos de `dt`, com piloto automático. */
  simulate(seconds: number, dt = 1 / 60) {
    const st = root();
    st.setFrameloop('never');
    let t = st.clock.elapsedTime;
    const steps = Math.round(seconds / dt);
    // Durante a simulação não precisamos desenhar: troca o render por no-op
    // (vale também para passes próprios do pipeline cel) e restaura no fim.
    const render = st.gl.render;
    st.gl.render = () => undefined;
    try {
      for (let i = 0; i < steps; i += 1) {
        setControlOverride(controlsFor(window.__race));
        t += dt;
        st.advance(t);
      }
    } finally {
      st.gl.render = render;
      setControlOverride(null);
    }
    return harness.info();
  },

  /** Posiciona a câmera numa vista fixa ao redor do jogador e renderiza um quadro. */
  view(name: HarnessView) {
    const st = root();
    const player = devRig.player;
    const o = devRig.override;
    if (name === 'chase' || !player) {
      o.active = false;
    } else {
      player.updateMatrixWorld();
      const pos = new THREE.Vector3().setFromMatrixPosition(player.matrixWorld);
      const q = new THREE.Quaternion().setFromRotationMatrix(player.matrixWorld);
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
      const up = new THREE.Vector3(0, 1, 0);
      const at = (f: number, r: number, u: number) =>
        pos.clone().addScaledVector(fwd, f).addScaledVector(right, r).addScaledVector(up, u);
      const poses: Record<Exclude<HarnessView, 'chase'>, [THREE.Vector3, THREE.Vector3, number]> = {
        side: [at(0.3, 6.5, 1.4), at(0.3, 0, 0.7), 40],
        front: [at(6.5, 3.2, 1.6), at(0, 0, 0.6), 42],
        rear: [at(-6.5, -2.6, 1.8), at(0, 0, 0.7), 42],
        top: [at(0.01, 0, 14), at(0, 0, 0), 45],
        wide: [at(-30, 22, 18), at(20, 0, 0), 55],
        low: [at(-4.5, 0.6, 0.45), at(8, 0, 0.8), 70],
      };
      const [p, target, fov] = poses[name];
      o.position.copy(p);
      o.target.copy(target);
      o.fov = fov;
      o.active = true;
    }
    // Um passo mínimo só para renderizar com a nova câmera.
    st.advance(st.clock.elapsedTime + 1e-4);
    return { view: name };
  },

  /** Liga/desliga o piloto automático em tempo real (frameloop normal), para medir frame time. */
  drive(on: boolean) {
    const st = root();
    devRig.override.active = false;
    st.setFrameloop('always');
    cancelAnimationFrame(driving);
    if (!on) {
      setControlOverride(null);
      return;
    }
    const tick = () => {
      setControlOverride(controlsFor(window.__race));
      driving = requestAnimationFrame(tick);
    };
    driving = requestAnimationFrame(tick);
  },

  /** Coleta intervalos de rAF por `ms` milissegundos (aba precisa estar visível). */
  async measure(ms: number) {
    const samples: number[] = [];
    let last = performance.now();
    const end = last + ms;
    await new Promise<void>((resolve) => {
      const f = (now: number) => {
        samples.push(now - last);
        last = now;
        if (now < end) requestAnimationFrame(f);
        else resolve();
      };
      requestAnimationFrame(f);
    });
    const s = samples.slice(5).sort((a, b) => a - b);
    const avg = s.reduce((a, b) => a + b, 0) / s.length;
    return {
      frames: s.length,
      avgMs: +avg.toFixed(2),
      p95Ms: +s[Math.floor(s.length * 0.95)].toFixed(2),
      worstMs: +s[s.length - 1].toFixed(2),
      fps: +(1000 / avg).toFixed(1),
      hidden: document.hidden,
    };
  },

  info() {
    const st = root();
    const s = window.__race;
    const hud = useGameStore.getState().hud;
    const info = st.gl.info.render;
    return {
      phase: useGameStore.getState().phase,
      speed: hud.speed,
      lap: hud.lap,
      position: hud.position,
      drawCalls: info.calls,
      triangles: info.triangles,
      progress: isCircuit(s) ? Math.round(s.player.p) : Math.round((s as InfiniteSession | undefined)?.distance ?? 0),
    };
  },
};

export function installHarness() {
  window.__harness = harness;
}
