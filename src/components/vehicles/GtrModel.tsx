import { useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { DRACOLoader } from 'three-stdlib';
import { MODEL_PATH } from '../../lib/game';
import { celify, createCelMaterial } from '../../rendering/cel';
import type { VehicleFx } from './fx';

function createDracoLoader() {
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
  return dracoLoader;
}

/** Comprimento final do carro em unidades de mundo (metros). */
export const GTR_LENGTH = 3.15;

export default function GtrModel({ fxRef }: { fxRef?: MutableRefObject<VehicleFx> }) {
  const gltf = useGLTF(MODEL_PATH, true, false, (loader) => {
    loader.setDRACOLoader(createDracoLoader());
  });
  const flamesRef = useRef<THREE.Group | null>(null);
  const flameMaterial = useMemo(() => {
    const m = createCelMaterial({ color: '#7cc7ff', unlit: true, transparent: true, opacity: 0.85, depthWrite: false, fog: false });
    m.blending = THREE.AdditiveBlending;
    return m;
  }, []);

  const preparedScene = useMemo(() => {
    const model = gltf.scene.clone(true);

    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (material && 'envMapIntensity' in material) material.envMapIntensity = 1.9;
        // Transmissão força um segundo render da cena inteira por frame
        // (~60 ms numa GPU integrada). Vidro transparente simples é suficiente.
        if (material instanceof THREE.MeshPhysicalMaterial && material.transmission > 0) {
          material.transmission = 0;
          material.transparent = true;
          material.opacity = 0.42;
          material.roughness = 0.05;
          material.metalness = 0.2;
          material.depthWrite = false;
        }
      }
    });

    const initialBox = new THREE.Box3().setFromObject(model);
    const initialSize = new THREE.Vector3();
    initialBox.getSize(initialSize);
    model.rotation.y = initialSize.x > initialSize.z ? -Math.PI / 2 : Math.PI;
    model.updateMatrixWorld(true);

    const alignedBox = new THREE.Box3().setFromObject(model);
    const alignedCenter = new THREE.Vector3();
    alignedBox.getCenter(alignedCenter);
    model.position.x -= alignedCenter.x;
    model.position.y -= alignedBox.min.y;
    model.position.z -= alignedCenter.z;
    model.updateMatrixWorld(true);

    const finalBox = new THREE.Box3().setFromObject(model);
    const finalSize = new THREE.Vector3();
    finalBox.getSize(finalSize);
    const dominantLength = Math.max(finalSize.x, finalSize.z);
    const scale = dominantLength > 0 ? GTR_LENGTH / dominantLength : 1;

    // Cel: troca os materiais PBR do GLB por cel com borda e contorno.
    celify(model, { outline: true, rim: 0.7 });
    return { model, scale };
  }, [gltf.scene]);

  useFrame((state) => {
    const flames = flamesRef.current;
    if (!flames || !fxRef) return;
    const { nitro } = fxRef.current;
    flames.visible = nitro;
    if (nitro) {
      const flicker = 0.8 + Math.sin(state.clock.elapsedTime * 60) * 0.2;
      flames.children.forEach((child) => child.scale.set(1, 1, flicker));
    }
  });

  return (
    <group>
      <group scale={preparedScene.scale}>
        <primitive object={preparedScene.model} />
      </group>
      <group ref={flamesRef} visible={false}>
        {[-0.42, 0.42].map((x) => (
          <mesh key={x} position={[x, 0.3, GTR_LENGTH / 2 + 0.32]} rotation-x={Math.PI / 2} material={flameMaterial}>
            <coneGeometry args={[0.1, 0.65, 8, 1, true]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

useGLTF.preload(MODEL_PATH);
