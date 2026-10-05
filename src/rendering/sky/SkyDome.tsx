import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { applySkyStyle, createSkyMaterial, pixelAngle, type SkyUniforms } from './skyMaterial';
import type { SkyStyle } from './types';

export type SkyDomeProps = {
  style: SkyStyle;
  /** raio do domo; irrelevante para a profundidade (o vertex cola no plano distante) */
  radius?: number;
  /**
   * false (padrão): desenha primeiro (renderOrder -1, sem teste de
   * profundidade), como fundo.
   * true: desenha DEPOIS dos opacos com teste de profundidade (LessEqual),
   * para o early-z descartar os pixels cobertos pelo cenário — bem mais
   * barato numa GPU integrada quando o cenário cobre boa parte da tela.
   * Visualmente idêntico desde que nada opaco fique além do plano distante.
   */
  cullHidden?: boolean;
};

const tmpSize = new THREE.Vector2();
const tmpPos = new THREE.Vector3();

/**
 * Domo de céu cel: esfera BackSide que segue a câmera (em onBeforeRender,
 * então vale para QUALQUER câmera que o renderize, sem atraso de 1 quadro),
 * sempre "no infinito", sem costura. Escreve gNormal com máscara 0.
 */
export function SkyDome({ style, radius = 900, cullHidden = false }: SkyDomeProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const material = useMemo(() => createSkyMaterial(), []);
  const geometry = useMemo(() => new THREE.SphereGeometry(radius, 64, 32), [radius]);

  // troca de estilo em tempo real: só uniforms (defines só se recursos mudarem)
  useEffect(() => {
    applySkyStyle(material, style);
  }, [material, style]);

  useEffect(() => {
    material.depthTest = cullHidden;
    material.depthFunc = THREE.LessEqualDepth;
    material.needsUpdate = true;
    const mesh = meshRef.current;
    if (mesh) mesh.renderOrder = cullHidden ? 10000 : -1;
  }, [material, cullHidden]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    // segue a câmera que está renderizando, imediatamente antes do draw
    // (three calcula modelViewMatrix DEPOIS de onBeforeRender)
    // (matrixWorld escrita direto: posição de MUNDO da câmera, mesmo se ela
    // estiver aninhada num rig)
    mesh.onBeforeRender = (_r, _s, camera) => {
      tmpPos.setFromMatrixPosition(camera.matrixWorld);
      mesh.matrixWorld.makeTranslation(tmpPos.x, tmpPos.y, tmpPos.z);
    };
    return () => {
      mesh.onBeforeRender = () => {};
    };
  }, []);

  useFrame(({ camera, gl }) => {
    const u = material.uniforms as SkyUniforms;
    const fov = (camera as THREE.PerspectiveCamera).isPerspectiveCamera
      ? (camera as THREE.PerspectiveCamera).fov
      : 60;
    gl.getDrawingBufferSize(tmpSize);
    u.uPixelAngle.value = pixelAngle(fov, tmpSize.y);
  });

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      renderOrder={cullHidden ? 10000 : -1}
      frustumCulled={false}
      matrixAutoUpdate={false}
      matrixWorldAutoUpdate={false}
    />
  );
}
