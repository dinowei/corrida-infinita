import { Environment, Sky } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { BiomeDefinition, WeatherDefinition } from '../../game/contracts';
import type { TrackFrames } from '../../game/tracks';
import { buildScenery, GROUND_Y } from '../../game/world/scenery';
import { createWindowTexture } from './textures';

function useInstancedMesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  matrices: THREE.Matrix4[],
  colors?: THREE.Color[],
) {
  return useMemo(() => {
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((m, i) => {
      mesh.setMatrixAt(i, m);
      if (colors) mesh.setColorAt(i, colors[i]);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    return mesh;
  }, [colors, geometry, material, matrices]);
}

type SceneryProps = {
  track: TrackFrames;
  biome: BiomeDefinition;
  weather: WeatherDefinition;
  /** fração do cenário instanciado (perfil de qualidade) */
  scenery: number;
};

export default function CircuitScenery({ track, biome, weather, scenery }: SceneryProps) {
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

  const assets = useMemo(() => {
    const windowMap = createWindowTexture();
    return {
      windowMap,
      tree: new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0),
      building: new THREE.BoxGeometry(1, 1, 1),
      mountain: new THREE.ConeGeometry(1, 1, 6),
      treeMat: new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }),
      buildingMat: new THREE.MeshStandardMaterial({ map: windowMap, roughness: 0.6, metalness: 0.1 }),
      mountainMat: new THREE.MeshStandardMaterial({ color: biome.mountains, roughness: 1, flatShading: true }),
    };
  }, [biome.mountains]);

  const trees = useInstancedMesh(assets.tree, assets.treeMat, data.trees, data.treeColors);
  const buildings = useInstancedMesh(assets.building, assets.buildingMat, data.buildings, data.buildingColors);
  const mountains = useInstancedMesh(assets.mountain, assets.mountainMat, data.mountains);

  useEffect(
    () => () => {
      assets.windowMap.dispose();
      [assets.tree, assets.building, assets.mountain].forEach((g) => g.dispose());
      [assets.treeMat, assets.buildingMat, assets.mountainMat].forEach((m) => m.dispose());
    },
    [assets],
  );

  return (
    <>
      <color attach="background" args={[weather.background]} />
      <fog attach="fog" args={[weather.fog.color, weather.fog.near, weather.fog.far]} />
      <Sky
        distance={450000}
        sunPosition={weather.sky.sunPosition}
        turbidity={weather.sky.turbidity}
        rayleigh={weather.sky.rayleigh}
        mieCoefficient={weather.sky.mie}
      />
      <Environment preset="park" environmentIntensity={weather.wetness > 0 ? 0.75 : 0.55} />
      <ambientLight intensity={weather.light.ambient} color="#dbe8ff" />
      <hemisphereLight intensity={weather.light.hemisphere} color="#cfe6ff" groundColor="#3b5a35" />
      <directionalLight intensity={weather.light.sun} color={weather.light.sunColor} position={[120, 180, -140]} />

      <mesh rotation-x={-Math.PI / 2} position={[data.center.x, GROUND_Y - 0.02, data.center.z]}>
        <planeGeometry args={[4200, 4200]} />
        <meshStandardMaterial color={biome.ground} roughness={1} />
      </mesh>
      <primitive object={trees} />
      <primitive object={buildings} />
      <primitive object={mountains} />
    </>
  );
}
