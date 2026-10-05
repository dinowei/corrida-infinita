import type { ThreeElements } from '@react-three/fiber';
import { useEffect, useMemo, type ReactNode } from 'react';
import * as THREE from 'three';
import { computeSmoothNormals, createOutlineMaterial } from './outline';

type OutlinedProps = {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** multiplicador sobre celUniforms.uOutlinePx (padrão 1) */
  thickness?: number;
  /** cor da tinta; sem cor usa a tinta global */
  outlineColor?: THREE.ColorRepresentation;
  /** desliga o contorno sem desmontar nada */
  outline?: boolean;
  children?: ReactNode;
} & Omit<ThreeElements['group'], 'children'>;

const noRaycast = () => {};

/**
 * Mesh cel + casco invertido irmão, dentro de um <group>.
 *   <Outlined geometry={g} material={m} thickness={1.2} position={[0, 1, 0]} />
 * As normais suavizadas são calculadas uma vez por geometria (cache no próprio
 * atributo). A espessura muda via uniform, sem recriar o material.
 */
export function Outlined({
  geometry,
  material,
  thickness = 1,
  outlineColor,
  outline = true,
  children,
  ...groupProps
}: OutlinedProps) {
  useMemo(() => computeSmoothNormals(geometry), [geometry]);

  // a cor entra como string/número na chave para não recriar a cada render
  const colorKey = outlineColor === undefined ? '' : new THREE.Color(outlineColor).getHexString();
  const outlineMaterial = useMemo(
    () => createOutlineMaterial(colorKey ? { color: `#${colorKey}` } : {}),
    [colorKey],
  );
  useEffect(() => () => outlineMaterial.dispose(), [outlineMaterial]);
  outlineMaterial.uniforms.uThickness.value = thickness;

  return (
    <group {...groupProps}>
      <mesh geometry={geometry} material={material} />
      {outline ? <mesh geometry={geometry} material={outlineMaterial} raycast={noRaycast} /> : null}
      {children}
    </group>
  );
}
