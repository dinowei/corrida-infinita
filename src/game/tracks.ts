import * as THREE from 'three';

import { TRACKS } from '../data/tracks';
import type { TrackDefinition } from './contracts';

export { seededRandom } from './world/generator';

/**
 * A partir dos pontos de controle de uma TrackDefinition geramos uma spline
 * Catmull-Rom fechada e amostramos "frames" a cada ~1 m: posição, tangente,
 * vetor lateral e normal com inclinação (banking) calculada pela curvatura.
 */

export type TrackFrames = {
  def: TrackDefinition;
  /** distância (m) de cada checkpoint intermediário, em ordem */
  checkpointDistances: number[];
  length: number;
  count: number;
  step: number;
  position: Float32Array;
  tangent: Float32Array;
  right: Float32Array;
  up: Float32Array;
  /** curvatura com sinal (1/m). Positiva = curva para a direita. */
  curvature: Float32Array;
  bank: Float32Array;
  minRadius: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number; minY: number };
};

const cache = new Map<string, TrackFrames>();

export function getTrack(id: string = TRACKS[0].id): TrackFrames {
  const cached = cache.get(id);
  if (cached) return cached;
  const def = TRACKS.find((t) => t.id === id) ?? TRACKS[0];
  const frames = buildFrames(def);
  cache.set(id, frames);
  return frames;
}

function buildFrames(def: TrackDefinition): TrackFrames {
  const curve = new THREE.CatmullRomCurve3(
    def.points.map(([x, y, z]) => new THREE.Vector3(x * def.scale, y, z * def.scale)),
    true,
    'centripetal',
  );
  const length = curve.getLength();
  const count = Math.max(200, Math.round(length));
  const step = length / count;

  const position = new Float32Array(count * 3);
  const tangent = new Float32Array(count * 3);
  const right = new Float32Array(count * 3);
  const up = new Float32Array(count * 3);
  const curvature = new Float32Array(count);
  const bank = new Float32Array(count);
  const heading = new Float32Array(count);

  const p = new THREE.Vector3();
  const t = new THREE.Vector3();
  for (let i = 0; i < count; i += 1) {
    const u = i / count;
    curve.getPointAt(u, p);
    curve.getTangentAt(u, t);
    position.set([p.x, p.y, p.z], i * 3);
    tangent.set([t.x, t.y, t.z], i * 3);
    heading[i] = Math.atan2(t.x, -t.z);
  }

  // Curvatura = variação do rumo por metro, suavizada numa janela.
  const raw = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    let dh = heading[(i + 1) % count] - heading[(i - 1 + count) % count];
    if (dh > Math.PI) dh -= Math.PI * 2;
    if (dh < -Math.PI) dh += Math.PI * 2;
    raw[i] = dh / (2 * step);
  }
  const window = 12;
  let minRadius = Infinity;
  for (let i = 0; i < count; i += 1) {
    let sum = 0;
    for (let j = -window; j <= window; j += 1) sum += raw[(i + j + count) % count];
    curvature[i] = sum / (window * 2 + 1);
    if (Math.abs(curvature[i]) > 1e-5) minRadius = Math.min(minRadius, 1 / Math.abs(curvature[i]));
    bank[i] = THREE.MathUtils.clamp(curvature[i] * 9, -0.2, 0.2);
  }

  const worldUp = new THREE.Vector3(0, 1, 0);
  const r = new THREE.Vector3();
  const n = new THREE.Vector3();
  const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, minY: Infinity };
  for (let i = 0; i < count; i += 1) {
    t.fromArray(tangent, i * 3);
    r.crossVectors(t, worldUp).normalize();
    // Inclinação positiva abaixa o lado direito (curva à direita).
    const b = bank[i];
    const flatUp = new THREE.Vector3().crossVectors(r, t).normalize();
    r.multiplyScalar(Math.cos(b)).addScaledVector(flatUp, -Math.sin(b)).normalize();
    n.crossVectors(r, t).normalize();
    right.set([r.x, r.y, r.z], i * 3);
    up.set([n.x, n.y, n.z], i * 3);

    const x = position[i * 3];
    const y = position[i * 3 + 1];
    const z = position[i * 3 + 2];
    bounds.minX = Math.min(bounds.minX, x);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.minZ = Math.min(bounds.minZ, z);
    bounds.maxZ = Math.max(bounds.maxZ, z);
    bounds.minY = Math.min(bounds.minY, y);
  }

  const checkpointDistances = def.checkpoints.map((c) => c.at * length);
  return { def, checkpointDistances, length, count, step, position, tangent, right, up, curvature, bank, minRadius, bounds };
}

export type FrameSample = {
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
  curvature: number;
};

export function createSample(): FrameSample {
  return {
    position: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
    right: new THREE.Vector3(),
    up: new THREE.Vector3(),
    curvature: 0,
  };
}

const tmpA = new THREE.Vector3();

export function wrapDistance(track: TrackFrames, s: number) {
  return ((s % track.length) + track.length) % track.length;
}

/** Interpola o frame em uma distância `s` (metros) ao longo da pista. */
export function sampleTrack(track: TrackFrames, s: number, out: FrameSample) {
  const ws = wrapDistance(track, s) / track.step;
  const i0 = Math.floor(ws) % track.count;
  const i1 = (i0 + 1) % track.count;
  const f = ws - Math.floor(ws);
  lerpInto(track.position, i0, i1, f, out.position);
  lerpInto(track.tangent, i0, i1, f, out.tangent).normalize();
  lerpInto(track.right, i0, i1, f, out.right).normalize();
  lerpInto(track.up, i0, i1, f, out.up).normalize();
  out.curvature = track.curvature[i0] * (1 - f) + track.curvature[i1] * f;
  return out;
}

function lerpInto(arr: Float32Array, i0: number, i1: number, f: number, target: THREE.Vector3) {
  target.fromArray(arr, i0 * 3);
  tmpA.fromArray(arr, i1 * 3);
  return target.lerp(tmpA, f);
}

/** Maior |curvatura| entre s e s+ahead — usado pela IA para frear antes da curva. */
export function maxCurvatureAhead(track: TrackFrames, s: number, ahead: number) {
  const start = Math.floor(wrapDistance(track, s) / track.step);
  const steps = Math.ceil(ahead / track.step);
  let maxK = 0;
  let signed = 0;
  for (let j = 0; j < steps; j += 3) {
    const k = track.curvature[(start + j) % track.count];
    if (Math.abs(k) > maxK) {
      maxK = Math.abs(k);
      signed = k;
    }
  }
  return signed;
}


/** Caminho SVG da pista (vista de cima) normalizado para um viewBox 100x100. */
export function minimapProjection(track: TrackFrames) {
  const { minX, maxX, minZ, maxZ } = track.bounds;
  const span = Math.max(maxX - minX, maxZ - minZ);
  const pad = 6;
  const scale = (100 - pad * 2) / span;
  const ox = pad + (100 - pad * 2 - (maxX - minX) * scale) / 2;
  const oz = pad + (100 - pad * 2 - (maxZ - minZ) * scale) / 2;
  const project = (x: number, z: number) => ({ x: ox + (x - minX) * scale, z: oz + (z - minZ) * scale });
  let d = '';
  for (let i = 0; i < track.count; i += 8) {
    const pt = project(track.position[i * 3], track.position[i * 3 + 2]);
    d += `${i === 0 ? 'M' : 'L'}${pt.x.toFixed(1)} ${pt.z.toFixed(1)} `;
  }
  return { path: `${d}Z`, project };
}
