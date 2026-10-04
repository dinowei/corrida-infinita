import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { celUniforms } from '../cel/uniforms';
import { computeFlareState, FLARE_ELEMENTS, type FlareState } from './flare';
import { flareFragmentShader, flareVertexShader } from './flareShader';

/**
 * Reflexo de lente GRÁFICO: alguns sprites de borda dura (hexágono, disco,
 * anel) ao longo da linha sol → centro da tela. Um único draw instanciado,
 * em espaço de tela (o vertex escreve NDC direto), aditivo e barato.
 *
 * gNormal: escreve vec4(0). Com AdditiveBlending (SrcAlpha, One) e alfa 0
 * a contribuição na saída 1 é zero, ou seja, o buffer de normais/máscara
 * fica INTACTO embaixo do reflexo (o Sobel não vê o reflexo).
 *
 * Limitação: não há teste de oclusão (o reflexo aparece mesmo se um prédio
 * tapar o sol). Ver `occlusion` para atenuar manualmente.
 */
export type SunFlareProps = {
  /** liga/desliga (normalmente style.flare) */
  enabled?: boolean;
  /** cor do sol, multiplica os elementos (normalmente style.sunColor) */
  sunColor?: string;
  /** 0..1 intensidade global */
  intensity?: number;
  /** 0..1, quanto o sol está tapado (opcional, calculado por quem chama) */
  occlusion?: number;
};

const SHAPE_ID = { disc: 0, hex: 1, ring: 2 } as const;

export function SunFlare({ enabled = true, sunColor = '#ffffff', intensity = 1, occlusion = 0 }: SunFlareProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const state = useMemo<FlareState>(() => ({ ndc: new THREE.Vector2(), fade: 0 }), []);

  const geometry = useMemo(() => {
    const quad = new THREE.PlaneGeometry(2, 2);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.getAttribute('position'));
    const n = FLARE_ELEMENTS.length;
    const t = new Float32Array(n);
    const size = new Float32Array(n);
    const shape = new Float32Array(n);
    const color = new Float32Array(n * 3);
    const alpha = new Float32Array(n);
    const tmp = new THREE.Color();
    FLARE_ELEMENTS.forEach((e, i) => {
      t[i] = e.t;
      size[i] = e.size;
      shape[i] = SHAPE_ID[e.shape];
      tmp.set(e.color).toArray(color, i * 3);
      alpha[i] = e.alpha;
    });
    g.setAttribute('aT', new THREE.InstancedBufferAttribute(t, 1));
    g.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 1));
    g.setAttribute('aShape', new THREE.InstancedBufferAttribute(shape, 1));
    g.setAttribute('aColor', new THREE.InstancedBufferAttribute(color, 3));
    g.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(alpha, 1));
    g.instanceCount = n;
    return g;
  }, []);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: flareVertexShader,
        fragmentShader: flareFragmentShader,
        uniforms: {
          uSunNdc: { value: new THREE.Vector2() },
          uAspect: { value: 16 / 9 },
          uTint: { value: new THREE.Color('#ffffff') },
          uFade: { value: 0 },
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      }),
    [],
  );

  useEffect(() => {
    (material.uniforms.uTint.value as THREE.Color).set(sunColor);
  }, [material, sunColor]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame(({ camera, size }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    if (!enabled) {
      mesh.visible = false;
      return;
    }
    computeFlareState(celUniforms.uSunDir.value, camera, state);
    const fade = state.fade * intensity * (1 - THREE.MathUtils.clamp(occlusion, 0, 1));
    mesh.visible = fade > 0.001;
    material.uniforms.uFade.value = fade;
    (material.uniforms.uSunNdc.value as THREE.Vector2).copy(state.ndc);
    material.uniforms.uAspect.value = size.width / Math.max(1, size.height);
  });

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      renderOrder={9999}
      frustumCulled={false}
    />
  );
}
