import * as THREE from 'three';
import { CEL_FRAGMENT_OUTPUTS } from './glsl';
import { celUniforms } from './uniforms';

/** nome do atributo com as normais suavizadas usadas para inflar o casco */
export const SMOOTH_NORMAL_ATTRIBUTE = 'aSmoothNormal';

/**
 * Calcula `aSmoothNormal`: para cada vértice, a média das normais de TODAS as
 * faces que tocam a mesma posição (posição quantizada em `tolerance`).
 *
 * Por que: em malhas low-poly com arestas duras os vértices são duplicados
 * com normais diferentes; inflar o casco pela normal original rasga o traço
 * nos cantos. Com a normal média, os vértices duplicados se movem juntos e o
 * contorno fica fechado.
 *
 * As normais de face são ponderadas pelo ÂNGULO do canto — assim o resultado
 * não depende de como as faces foram trianguladas (um quad dividido em dois
 * triângulos não pesa o dobro). Funciona com geometria indexada ou não.
 * Se o atributo já existir, nada é recalculado.
 */
export function computeSmoothNormals(geometry: THREE.BufferGeometry, tolerance = 1e-4): THREE.BufferGeometry {
  if (geometry.getAttribute(SMOOTH_NORMAL_ATTRIBUTE)) return geometry;
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
  if (!pos) return geometry;

  const vertexCount = pos.count;
  const inv = 1 / tolerance;

  // 1) agrupa vértices pela posição quantizada
  const groupOf = new Int32Array(vertexCount);
  const keyToGroup = new Map<string, number>();
  for (let i = 0; i < vertexCount; i++) {
    const key = `${Math.round(pos.getX(i) * inv)},${Math.round(pos.getY(i) * inv)},${Math.round(pos.getZ(i) * inv)}`;
    let g = keyToGroup.get(key);
    if (g === undefined) {
      g = keyToGroup.size;
      keyToGroup.set(key, g);
    }
    groupOf[i] = g;
  }

  // 2) acumula normais de face (ponderadas pelo ângulo) por grupo
  const acc = new Float64Array(keyToGroup.size * 3);
  const index = geometry.getIndex();
  const triCount = Math.floor((index ? index.count : vertexCount) / 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const bc = new THREE.Vector3();
  const n = new THREE.Vector3();

  const angle = (u: THREE.Vector3, v: THREE.Vector3): number => {
    const lu = u.length();
    const lv = v.length();
    if (lu === 0 || lv === 0) return 0;
    return Math.acos(THREE.MathUtils.clamp(u.dot(v) / (lu * lv), -1, 1));
  };

  for (let t = 0; t < triCount; t++) {
    const ia = index ? index.getX(t * 3) : t * 3;
    const ib = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const ic = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    a.fromBufferAttribute(pos, ia);
    b.fromBufferAttribute(pos, ib);
    c.fromBufferAttribute(pos, ic);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    bc.subVectors(c, b);
    n.crossVectors(ab, ac);
    const len = n.length();
    if (len < 1e-12) continue; // triângulo degenerado
    n.divideScalar(len);

    const wa = angle(ab, ac);
    const wb = angle(ab.negate(), bc);
    const wc = Math.max(0, Math.PI - wa - wb);
    const corners: Array<[number, number]> = [
      [ia, wa],
      [ib, wb],
      [ic, wc],
    ];
    for (const [vi, w] of corners) {
      const g = groupOf[vi] * 3;
      acc[g] += n.x * w;
      acc[g + 1] += n.y * w;
      acc[g + 2] += n.z * w;
    }
  }

  // 3) normaliza; se a soma zerar (faces opostas coincidentes), usa a normal
  //    original do vértice, se houver
  const normalAttr = geometry.getAttribute('normal') as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
  const out = new Float32Array(vertexCount * 3);
  for (let i = 0; i < vertexCount; i++) {
    const g = groupOf[i] * 3;
    let x = acc[g];
    let y = acc[g + 1];
    let z = acc[g + 2];
    let l = Math.hypot(x, y, z);
    if (l < 1e-9 && normalAttr) {
      x = normalAttr.getX(i);
      y = normalAttr.getY(i);
      z = normalAttr.getZ(i);
      l = Math.hypot(x, y, z);
    }
    if (l > 1e-9) {
      out[i * 3] = x / l;
      out[i * 3 + 1] = y / l;
      out[i * 3 + 2] = z / l;
    }
  }
  geometry.setAttribute(SMOOTH_NORMAL_ATTRIBUTE, new THREE.Float32BufferAttribute(out, 3));
  return geometry;
}

export type OutlineMaterialOptions = {
  /** cor da tinta; sem cor, usa celUniforms.uInkColor (compartilhado) */
  color?: THREE.ColorRepresentation;
  /** multiplicador sobre celUniforms.uOutlinePx (padrão 1) */
  thicknessPx?: number;
  /** máscara de borda no G-buffer; 0 = o Sobel ignora a tinta (padrão) */
  edgeMask?: 0 | 1;
  opacity?: number;
  fog?: boolean;
};

const outlineVertexShader = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
#include <clipping_planes_pars_vertex>

attribute vec3 aSmoothNormal;

uniform vec2 uResolution;   // drawing buffer (px)
uniform float uOutlinePx;   // espessura base em px CSS
uniform float uPixelRatio;  // px CSS -> px do drawing buffer
uniform float uThickness;   // multiplicador por material

void main() {
  // normal suavizada -> espaço de câmera (mesma correção de escala que o
  // three usa para instanceMatrix em <defaultnormal_vertex>)
  vec3 n = aSmoothNormal;
#ifdef USE_INSTANCING
  mat3 im = mat3(instanceMatrix);
  n /= vec3(dot(im[0], im[0]), dot(im[1], im[1]), dot(im[2], im[2]));
  n = im * n;
#endif
  vec3 viewN = normalize(normalMatrix * n);

  // posição normal (aplica instanceMatrix): define mvPosition e gl_Position
  vec3 transformed = vec3(position);
  #include <project_vertex>
  #include <clipping_planes_vertex>

  // direção da normal NA TELA: derivada de xy/w ao longo da normal.
  //   d(xy/w) = (dxy * w - xy * dw) / w²  — o fator 1/w² não muda a direção.
  // Considerar dw deixa a direção certa também nas bordas da tela.
  vec4 clipN = projectionMatrix * vec4(viewN, 0.0);
  vec2 ndcDir = clipN.xy * gl_Position.w - gl_Position.xy * clipN.w;

  // normaliza em PIXELS (corrige a proporção da tela) e converte de volta
  // para NDC: 1 px = 2 / resolução. Multiplicar por w desfaz a divisão
  // perspectiva, então a largura é constante em pixels a qualquer distância.
  vec2 pxDir = ndcDir * uResolution;
  pxDir /= max(length(pxDir), 1e-6);
  float px = uOutlinePx * uPixelRatio * uThickness;
  gl_Position.xy += pxDir * (px * 2.0 / uResolution) * gl_Position.w;

  #include <fog_vertex>
}
`;

const outlineFragmentShader = /* glsl */ `
${CEL_FRAGMENT_OUTPUTS}

#include <common>
#include <fog_pars_fragment>
#include <clipping_planes_pars_fragment>

uniform vec3 uColor;
uniform float uOpacity;
uniform float uEdgeMask;

void main() {
  #include <clipping_planes_fragment>
  gl_FragColor = vec4(uColor, uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  // a tinta some na névoa junto com o objeto
  #include <fog_fragment>

  // máscara 0: o Sobel do pós-processo ignora a vizinhança do traço, para
  // não desenhar uma segunda linha colada ao casco invertido
  gNormal = vec4(0.5, 0.5, 1.0, uEdgeMask);
}
`;

export type OutlineMaterial = THREE.ShaderMaterial & { readonly isCelOutlineMaterial: true };

/**
 * Material do casco invertido: BackSide, inflado em espaço de tela com
 * largura constante em pixels. Suporta InstancedMesh e névoa.
 */
export function createOutlineMaterial(opts: OutlineMaterialOptions = {}): OutlineMaterial {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]) as Record<string, THREE.IUniform>;
  Object.assign(uniforms, {
    uColor: opts.color !== undefined ? { value: new THREE.Color(opts.color) } : celUniforms.uInkColor,
    uOpacity: { value: opts.opacity ?? 1 },
    uEdgeMask: { value: opts.edgeMask ?? 0 },
    uThickness: { value: opts.thicknessPx ?? 1 },
    // globais por referência (depois do merge, que clona)
    uOutlinePx: celUniforms.uOutlinePx,
    uResolution: celUniforms.uResolution,
    uPixelRatio: celUniforms.uPixelRatio,
  });

  const mat = new THREE.ShaderMaterial({
    name: 'CelOutline',
    glslVersion: THREE.GLSL3,
    uniforms,
    vertexShader: outlineVertexShader,
    fragmentShader: outlineFragmentShader,
    side: THREE.BackSide,
    fog: opts.fog ?? true,
    transparent: (opts.opacity ?? 1) < 1,
    // empurra o casco um tiquinho para trás: na silhueta as faces de trás
    // ficam quase coplanares às da frente e brigariam no z-buffer
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  }) as OutlineMaterial;
  (mat as { isCelOutlineMaterial: boolean }).isCelOutlineMaterial = true;
  return mat;
}

/** multiplicador de espessura de um material de contorno */
export function setOutlineThickness(material: THREE.ShaderMaterial, thickness: number): void {
  if (material.uniforms.uThickness) material.uniforms.uThickness.value = thickness;
}

export type AddOutlineOptions = OutlineMaterialOptions & {
  /** reaproveita um material de contorno existente (ignora as outras opções) */
  material?: THREE.ShaderMaterial;
};

const noRaycast = () => {};

/**
 * Cria o contorno de casco invertido como FILHO de `mesh`, compartilhando a
 * geometria (e, em InstancedMesh, o MESMO atributo instanceMatrix e o count).
 * Idempotente: se o mesh já tem contorno, devolve o existente.
 * Não use em SkinnedMesh (o casco não acompanha os ossos).
 */
export function addOutline(mesh: THREE.Mesh | THREE.InstancedMesh, opts: AddOutlineOptions = {}): THREE.Mesh {
  const existing = mesh.children.find((c) => c.userData.celOutline === true);
  if (existing) return existing as THREE.Mesh;

  computeSmoothNormals(mesh.geometry);
  const material = opts.material ?? createOutlineMaterial(opts);

  let outline: THREE.Mesh;
  if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
    const src = mesh as THREE.InstancedMesh;
    // count 0 na construção para não alocar outra matriz por instância
    const inst = new THREE.InstancedMesh(src.geometry, material, 0);
    inst.instanceMatrix = src.instanceMatrix; // mesmo atributo = mesmo buffer na GPU
    inst.count = src.count;
    // acompanha mudanças de count feitas no original
    inst.onBeforeRender = () => {
      inst.count = src.count;
    };
    // culling: usa a esfera do original (que quem move instâncias já recalcula)
    Object.defineProperty(inst, 'boundingSphere', {
      configurable: true,
      get: () => {
        if (src.boundingSphere === null) src.computeBoundingSphere();
        return src.boundingSphere;
      },
      set: () => {},
    });
    Object.defineProperty(inst, 'boundingBox', {
      configurable: true,
      get: () => {
        if (src.boundingBox === null) src.computeBoundingBox();
        return src.boundingBox;
      },
      set: () => {},
    });
    outline = inst;
  } else {
    outline = new THREE.Mesh(mesh.geometry, material);
  }

  outline.name = mesh.name ? `${mesh.name}__outline` : 'outline';
  outline.userData.celOutline = true;
  outline.raycast = noRaycast;
  outline.castShadow = false;
  outline.receiveShadow = false;
  outline.frustumCulled = mesh.frustumCulled;
  outline.renderOrder = mesh.renderOrder;
  mesh.add(outline);
  return outline;
}

/** remove (e opcionalmente descarta o material de) contornos filhos de `mesh` */
export function removeOutline(mesh: THREE.Object3D, disposeMaterial = true): void {
  for (const child of [...mesh.children]) {
    if (child.userData.celOutline !== true) continue;
    mesh.remove(child);
    if (disposeMaterial) ((child as THREE.Mesh).material as THREE.Material).dispose();
  }
}
