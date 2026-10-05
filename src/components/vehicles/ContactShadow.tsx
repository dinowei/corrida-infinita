import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { celUniforms, createCelMaterial } from '../../rendering/cel';

// Disco de raio 0,5 escalado em elipse: a borda é geometria, então fica dura a qualquer distância.
const geometry = new THREE.CircleGeometry(0.5, 28).rotateX(-Math.PI / 2);

/**
 * Sombra de contato cel: elipse chapada de borda dura, no tom da tinta do
 * clima (celUniforms.uInkColor, translúcida), colada na pista. É o que
 * "assenta" o veículo no chão — sem ela tudo parece flutuar. Sem shadow map.
 */
export default function ContactShadow({
  width,
  length,
  opacity = 0.42,
  lift = 0.035,
}: {
  width: number;
  length: number;
  opacity?: number;
  lift?: number;
}) {
  const material = useMemo(() => {
    const m = createCelMaterial({
      color: '#ffffff',
      unlit: true,
      transparent: true,
      opacity,
      depthWrite: false,
      edgeMask: 0,
    });
    // Tom da tinta do clima, por referência: escurece o chão sem acinzentar.
    m.uniforms.uColor = celUniforms.uInkColor;
    m.polygonOffset = true;
    m.polygonOffsetFactor = -2;
    m.polygonOffsetUnits = -2;
    return m;
  }, [opacity]);

  useEffect(() => () => material.dispose(), [material]);

  return <mesh geometry={geometry} material={material} position={[0, lift, 0]} scale={[width, 1, length]} renderOrder={1} />;
}
