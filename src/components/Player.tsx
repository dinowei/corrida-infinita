import { useMemo, type RefObject } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { DRACOLoader } from 'three-stdlib';
import { MODEL_PATH } from '../lib/game';

type PlayerProps = {
  carRef: RefObject<THREE.Group | null>;
};

function createDracoLoader() {
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
  return dracoLoader;
}

export default function Player({ carRef }: PlayerProps) {
  const gltf = useGLTF(MODEL_PATH, true, false, (loader) => {
    loader.setDRACOLoader(createDracoLoader());
  });

  const preparedScene = useMemo(() => {
    const model = gltf.scene.clone(true);

    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;

      if (Array.isArray(object.material)) {
        for (const material of object.material) {
          if ('envMapIntensity' in material) {
            material.envMapIntensity = 1.9;
          }
          material.needsUpdate = true;
        }
      } else if (object.material) {
        if ('envMapIntensity' in object.material) {
          object.material.envMapIntensity = 1.9;
        }
        object.material.needsUpdate = true;
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
    const scale = dominantLength > 0 ? 3.15 / dominantLength : 1;

    return { model, scale };
  }, [gltf.scene]);

  return (
    <group ref={carRef} scale={preparedScene.scale} position={[0, 0, 0]}>
      <primitive object={preparedScene.model} />
    </group>
  );
}

useGLTF.preload(MODEL_PATH);
