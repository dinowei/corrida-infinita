import * as THREE from 'three';
import type { BiomeDefinition } from '../contracts';
import { SHOULDER } from '../modes/circuitSession';
import type { TrackFrames } from '../tracks';
import { seededRandom } from './generator';

/** Altura do chão em relação à pista (o viaduto fica acima dele). */
export const GROUND_Y = -0.7;

/**
 * Ambiente diurno do circuito: chão, floresta low-poly, skyline de prédios e
 * montanhas. Tudo posicionado por semente — a mesma pista sempre gera o
 * mesmo cenário.
 */
export function distanceToTrackSq(track: TrackFrames, x: number, z: number) {
  let best = Infinity;
  for (let i = 0; i < track.count; i += 6) {
    const dx = track.position[i * 3] - x;
    const dz = track.position[i * 3 + 2] - z;
    const d = dx * dx + dz * dz;
    if (d < best) best = d;
  }
  return best;
}

/**
 * Gera o cenário completo da seed; perfis de qualidade menores usam um
 * prefixo da mesma lista, então o mundo continua determinístico.
 */
export function buildScenery(track: TrackFrames, biome: BiomeDefinition) {
  const rand = seededRandom(track.def.seed);
  const { minX, maxX, minZ, maxZ } = track.bounds;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const radius = Math.max(maxX - minX, maxZ - minZ) / 2;
  const clearance = track.def.width / 2 + SHOULDER + 9;

  const trees: THREE.Matrix4[] = [];
  const treeColors: THREE.Color[] = [];
  const palette = biome.trees.map((c) => new THREE.Color(c));
  let attempts = 0;
  while (trees.length < biome.density.trees && attempts < biome.density.trees * 10) {
    attempts += 1;
    const x = cx + (rand() * 2 - 1) * (radius + 220);
    const z = cz + (rand() * 2 - 1) * (radius + 220);
    if (distanceToTrackSq(track, x, z) < clearance * clearance) continue;
    const h = 7 + rand() * 9;
    trees.push(
      new THREE.Matrix4().compose(
        new THREE.Vector3(x, GROUND_Y, z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI),
        new THREE.Vector3(h * 0.32, h, h * 0.32),
      ),
    );
    treeColors.push(palette[Math.floor(rand() * palette.length)]);
  }

  const buildings: THREE.Matrix4[] = [];
  const buildingColors: THREE.Color[] = [];
  const tones = biome.buildings.map((c) => new THREE.Color(c));
  for (let i = 0; i < biome.density.buildings; i += 1) {
    const angle = rand() * Math.PI * 2;
    const dist = radius + 260 + rand() * 380;
    const x = cx + Math.cos(angle) * dist;
    const z = cz + Math.sin(angle) * dist;
    const w = 18 + rand() * 26;
    const d = 18 + rand() * 26;
    const h = 30 + rand() * rand() * 140;
    buildings.push(
      new THREE.Matrix4().compose(
        new THREE.Vector3(x, GROUND_Y + h / 2, z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle),
        new THREE.Vector3(w, h, d),
      ),
    );
    buildingColors.push(tones[Math.floor(rand() * tones.length)]);
  }

  const mountains: THREE.Matrix4[] = [];
  const mountainCount = biome.density.mountains;
  for (let i = 0; i < mountainCount; i += 1) {
    const angle = (i / mountainCount) * Math.PI * 2 + rand() * 0.2;
    const dist = radius + 900 + rand() * 300;
    const h = 120 + rand() * 220;
    mountains.push(
      new THREE.Matrix4().compose(
        new THREE.Vector3(cx + Math.cos(angle) * dist, GROUND_Y + h / 2 - 5, cz + Math.sin(angle) * dist),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI),
        new THREE.Vector3(h * 1.6, h, h * 1.4),
      ),
    );
  }

  return { trees, treeColors, buildings, buildingColors, mountains, center: new THREE.Vector3(cx, GROUND_Y, cz) };
}
