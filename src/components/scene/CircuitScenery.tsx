import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { BiomeDefinition, WeatherDefinition } from '../../game/contracts';
import type { TrackFrames } from '../../game/tracks';
import { seededRandom } from '../../game/world/generator';
import { buildScenery, GROUND_Y } from '../../game/world/scenery';
import { addOutline, createCelMaterial } from '../../rendering/cel';
import { applyCelLighting } from '../../rendering/environment';
import { SKY_PRESETS, SkyDome, SunFlare } from '../../rendering/sky';
import { createWindowTexture } from './textures';

/**
 * Ambiente do circuito em cel: domo de céu do clima, chão chapado, floresta
 * low-poly com copa e tronco, skyline com fachadas desenhadas e montanhas
 * com neve. Tudo posicionado por semente (game/world/scenery.ts).
 */
type SceneryProps = {
  track: TrackFrames;
  biome: BiomeDefinition;
  weather: WeatherDefinition;
  /** fração do cenário instanciado (perfil de qualidade) */
  scenery: number;
};

function instanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  matrices: THREE.Matrix4[],
  colors?: THREE.Color[],
  outline = false,
) {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, matrices.length));
  matrices.forEach((m, i) => {
    mesh.setMatrixAt(i, m);
    if (colors) mesh.setColorAt(i, colors[i]);
  });
  mesh.count = matrices.length;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  if (outline) addOutline(mesh);
  return mesh;
}

/** Copa em dois cones empilhados (silhueta de pinheiro desenhado) + tronco. */
function treeGeometries() {
  const lower = new THREE.ConeGeometry(1, 0.62, 7).translate(0, 0.47, 0);
  const upper = new THREE.ConeGeometry(0.7, 0.5, 7).translate(0, 0.78, 0);
  const crown = mergeTwo(lower, upper);
  const trunk = new THREE.CylinderGeometry(0.12, 0.16, 0.24, 5).translate(0, 0.12, 0);
  return { crown, trunk };
}

function mergeTwo(a: THREE.BufferGeometry, b: THREE.BufferGeometry) {
  const ga = a.toNonIndexed();
  const gb = b.toNonIndexed();
  const pos = new Float32Array([...ga.getAttribute('position').array, ...gb.getAttribute('position').array]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  [a, b, ga, gb].forEach((x) => x.dispose());
  return g;
}

export default function CircuitScenery({ track, biome, weather, scenery }: SceneryProps) {
  const palette = biome.palette;

  useEffect(() => {
    applyCelLighting(weather.light);
  }, [weather.light]);

  const data = useMemo(() => {
    const full = buildScenery(track, biome);
    const trees = Math.round(full.trees.length * scenery);
    const buildings = Math.round(full.buildings.length * Math.max(0.5, scenery));
    return {
      ...full,
      trees: full.trees.slice(0, trees),
      treeColors: full.treeColors.slice(0, trees),
      buildings: full.buildings.slice(0, buildings),
      buildingColors: full.buildingColors.slice(0, buildings),
    };
  }, [biome, scenery, track]);

  const scene = useMemo(() => {
    const windowMap = createWindowTexture(palette.windows, weather.light.ink, seededRandom(track.def.seed ^ 0xb11d));
    const tree = treeGeometries();
    const building = new THREE.BoxGeometry(1, 1, 1);
    const mountain = new THREE.ConeGeometry(1, 1, 6);
    const cap = new THREE.ConeGeometry(0.32, 0.3, 6).translate(0, 0.35, 0);

    const mats = {
      crown: createCelMaterial({ color: '#ffffff', flatShading: true }),
      trunk: createCelMaterial({ color: palette.trunk }),
      building: createCelMaterial({ color: '#ffffff', map: windowMap }),
      mountain: createCelMaterial({ color: palette.mountains, flatShading: true }),
      cap: createCelMaterial({ color: palette.mountainSnow, flatShading: true }),
    };

    const meshes = [
      instanced(tree.crown, mats.crown, data.trees, data.treeColors, true),
      instanced(tree.trunk, mats.trunk, data.trees),
      instanced(building, mats.building, data.buildings, data.buildingColors, true),
      instanced(mountain, mats.mountain, data.mountains),
      instanced(cap, mats.cap, data.mountains),
    ];
    return { meshes, mats, windowMap, geometries: [tree.crown, tree.trunk, building, mountain, cap] };
  }, [data, palette, track.def.seed, weather.light.ink]);

  const groundMat = useMemo(() => createCelMaterial({ color: palette.ground }), [palette.ground]);

  useEffect(
    () => () => {
      scene.windowMap.dispose();
      scene.geometries.forEach((g) => g.dispose());
      Object.values(scene.mats).forEach((m) => m.dispose());
      groundMat.dispose();
    },
    [groundMat, scene],
  );

  const sky = SKY_PRESETS[weather.skyPreset];

  return (
    <>
      <fog attach="fog" args={[weather.fog.color, weather.fog.near, weather.fog.far]} />
      <SkyDome style={sky} />
      {sky.flare ? <SunFlare sunColor={sky.sunColor} /> : null}

      <mesh rotation-x={-Math.PI / 2} position={[data.center.x, GROUND_Y - 0.02, data.center.z]} material={groundMat}>
        <planeGeometry args={[4200, 4200]} />
      </mesh>
      {scene.meshes.map((mesh) => (
        <primitive key={mesh.uuid} object={mesh} />
      ))}
    </>
  );
}
