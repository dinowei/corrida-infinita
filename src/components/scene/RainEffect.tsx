import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { getPhase } from '../../game/store';
import { CEL_FRAGMENT_OUTPUTS } from '../../rendering/cel';

/**
 * Chuva em GPU: cada gota é um segmento cuja posição é calculada no vertex
 * shader a partir de uma semente e do tempo. A CPU só atualiza dois uniforms
 * por frame, então o custo depende apenas do número de gotas (perfil de
 * qualidade). As gotas ficam ancoradas no mundo e "embrulham" ao redor da
 * câmera, então passam rápido quando o carro acelera.
 */
const BOX = new THREE.Vector3(70, 34, 90);

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uCenter;
  uniform vec3 uBox;
  uniform float uLength;
  in vec3 aSeed;
  in float aEnd;
  out float vAlpha;
  void main() {
    vec3 origin = uCenter - uBox * 0.5;
    vec3 fall = vec3(uTime * 4.0, -uTime * 24.0, 0.0);
    vec3 p = origin + mod(aSeed * uBox - origin + fall, uBox);
    p.y -= aEnd * uLength;
    p.x -= aEnd * uLength * 0.16;
    vAlpha = 1.0 - aEnd;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  ${CEL_FRAGMENT_OUTPUTS}
  uniform float uIntensity;
  in float vAlpha;
  void main() {
    pc_fragColor = vec4(0.82, 0.88, 0.96, vAlpha * 0.5 * uIntensity);
    // Chuva não gera traço: alfa 0 com blending normal deixa o G-buffer intacto.
    gNormal = vec4(0.0);
  }
`;

export default function RainEffect({ intensity, maxDrops }: { intensity: number; maxDrops: number }) {
  const { camera } = useThree();
  const count = Math.max(50, Math.round(maxDrops * intensity));

  const { geometry, material } = useMemo(() => {
    const seeds = new Float32Array(count * 2 * 3);
    const ends = new Float32Array(count * 2);
    // Semente fixa: a chuva é a mesma a cada corrida.
    let a = 12345;
    const rand = () => {
      a = (a * 16807) % 2147483647;
      return a / 2147483647;
    };
    for (let i = 0; i < count; i += 1) {
      const sx = rand();
      const sy = rand();
      const sz = rand();
      for (let j = 0; j < 2; j += 1) {
        seeds.set([sx, sy, sz], (i * 2 + j) * 3);
        ends[i * 2 + j] = j;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 2 * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
    g.setAttribute('aEnd', new THREE.BufferAttribute(ends, 1));
    const m = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uCenter: { value: new THREE.Vector3() },
        uBox: { value: BOX },
        uLength: { value: 0.9 },
        uIntensity: { value: intensity },
      },
    });
    return { geometry: g, material: m };
  }, [count, intensity]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  const forward = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, delta) => {
    if (getPhase() !== 'paused') material.uniforms.uTime.value += delta;
    camera.getWorldDirection(forward);
    material.uniforms.uCenter.value.copy(camera.position).addScaledVector(forward, BOX.z * 0.4);
  });

  return <lineSegments geometry={geometry} material={material} frustumCulled={false} renderOrder={10} />;
}
