import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  addOutline,
  buildRamp,
  buildRampData,
  celify,
  CelMaterial,
  celUniforms,
  computeSmoothNormals,
  DEFAULT_RAMP_STOPS,
  installDefaultRamp,
  sampleRampStops,
  SMOOTH_NORMAL_ATTRIBUTE,
} from '../index';

describe('rampa', () => {
  it('cada texel pega o valor da última parada com at <= u (centro do texel)', () => {
    const stops = [
      { at: 0, value: 0.25 },
      { at: 0.5, value: 1 },
    ];
    const data = buildRampData(stops, 4); // centros 0.125, 0.375, 0.625, 0.875
    expect(Array.from(data)).toEqual([64, 64, 255, 255]);
  });

  it('ordena paradas e usa a primeira antes do início', () => {
    const stops = [
      { at: 0.6, value: 1 },
      { at: 0.2, value: 0.5 },
    ];
    expect(sampleRampStops(stops, 0.1)).toBe(0.5);
    expect(sampleRampStops(stops, 0.2)).toBe(0.5);
    expect(sampleRampStops(stops, 0.59)).toBe(0.5);
    expect(sampleRampStops(stops, 0.6)).toBe(1);
  });

  it('é monotônica e só tem tantos níveis quanto paradas (degraus duros)', () => {
    const data = buildRampData(DEFAULT_RAMP_STOPS, 64);
    const levels = new Set(data);
    expect(levels.size).toBe(DEFAULT_RAMP_STOPS.length);
    for (let i = 1; i < data.length; i++) expect(data[i]).toBeGreaterThanOrEqual(data[i - 1]);
  });

  it('padrão: ~1/3 da esfera visível em sombra — limiares coerentes com o half-lambert', () => {
    // fração da ÁREA da esfera com h < t é exatamente t; a sombra (duas
    // primeiras faixas) precisa ocupar o lado oposto ao sol (h <= ~0.5)
    const shadowEnd = DEFAULT_RAMP_STOPS[2].at;
    expect(shadowEnd).toBeGreaterThanOrEqual(0.48);
    expect(shadowEnd).toBeLessThanOrEqual(0.56);
    expect(DEFAULT_RAMP_STOPS[3].value).toBe(1);
  });

  it('DataTexture com NearestFilter, sem mipmaps, ClampToEdge', () => {
    const tex = buildRamp(DEFAULT_RAMP_STOPS, 64);
    expect(tex.image.width).toBe(64);
    expect(tex.minFilter).toBe(THREE.NearestFilter);
    expect(tex.magFilter).toBe(THREE.NearestFilter);
    expect(tex.generateMipmaps).toBe(false);
    expect(tex.wrapS).toBe(THREE.ClampToEdgeWrapping);
    expect(tex.version).toBeGreaterThan(0); // needsUpdate
  });

  it('installDefaultRamp só instala se vazio', () => {
    const a = installDefaultRamp();
    const b = installDefaultRamp();
    expect(a).toBe(b);
    expect(celUniforms.uRamp.value).toBe(a);
  });
});

describe('normais suavizadas', () => {
  const smoothOf = (g: THREE.BufferGeometry, i: number) =>
    new THREE.Vector3().fromBufferAttribute(g.getAttribute(SMOOTH_NORMAL_ATTRIBUTE) as THREE.BufferAttribute, i);

  it('cubo com arestas duras: cada canto aponta na diagonal, igual em todos os duplicados', () => {
    const g = new THREE.BoxGeometry(2, 2, 2); // indexado, 24 vértices
    computeSmoothNormals(g);
    const pos = g.getAttribute('position');
    const diag = 1 / Math.sqrt(3);
    for (let i = 0; i < pos.count; i++) {
      const n = smoothOf(g, i);
      expect(Math.abs(n.x)).toBeCloseTo(diag, 5);
      expect(Math.abs(n.y)).toBeCloseTo(diag, 5);
      expect(Math.abs(n.z)).toBeCloseTo(diag, 5);
      // aponta para fora
      expect(n.dot(new THREE.Vector3().fromBufferAttribute(pos, i))).toBeGreaterThan(0);
    }
  });

  it('funciona em geometria não indexada (mesmo resultado)', () => {
    const g = new THREE.BoxGeometry(2, 2, 2).toNonIndexed();
    computeSmoothNormals(g);
    const diag = 1 / Math.sqrt(3);
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const n = smoothOf(g, i);
      expect(Math.abs(n.x)).toBeCloseTo(diag, 5);
      expect(n.dot(new THREE.Vector3().fromBufferAttribute(pos, i))).toBeGreaterThan(0);
    }
  });

  it('independe da triangulação (ponderação por ângulo)', () => {
    // canto de um "L" de duas faces: face +Y com 2 triângulos, face +X com 1
    // triângulo -> média por ângulo ainda dá 45°
    const verts = [
      // face +Y (quad em 2 triângulos) tocando a origem com ângulo total 90°
      0, 0, 0, 0, 0, 1, 1, 0, 1,
      0, 0, 0, 1, 0, 1, 1, 0, 0,
      // face +X (1 triângulo) com ângulo de 90° no canto
      0, 0, 0, 0, -1, 0, 0, 0, 1,
    ];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    computeSmoothNormals(g);
    const n = smoothOf(g, 0);
    // face +X aqui tem normal -X (ordem dos vértices); importa a simetria
    expect(Math.abs(Math.abs(n.x) - Math.abs(n.y))).toBeLessThan(1e-6);
  });

  it('não recalcula se o atributo já existe', () => {
    const g = new THREE.BoxGeometry();
    computeSmoothNormals(g);
    const attr = g.getAttribute(SMOOTH_NORMAL_ATTRIBUTE);
    computeSmoothNormals(g);
    expect(g.getAttribute(SMOOTH_NORMAL_ATTRIBUTE)).toBe(attr);
  });
});

describe('CelMaterial', () => {
  it('liga os uniforms globais POR REFERÊNCIA (inclusive após clone)', () => {
    const m = new CelMaterial({ color: '#ff0000' });
    expect(m.uniforms.uSunDir).toBe(celUniforms.uSunDir);
    expect(m.uniforms.uRamp).toBe(celUniforms.uRamp);
    expect(m.uniforms.uRamp.value).not.toBeNull();
    const c = m.clone();
    expect(c.uniforms.uSunColor).toBe(celUniforms.uSunColor);
    expect(c.uniforms.uColor).not.toBe(m.uniforms.uColor);
    expect(c.color.equals(m.color)).toBe(true);
  });

  it('GLSL3, névoa e defines só dos recursos usados', () => {
    const m = new CelMaterial({ rim: 0.6 });
    expect(m.glslVersion).toBe(THREE.GLSL3);
    expect(m.fog).toBe(true);
    expect(m.uniforms.fogColor).toBeDefined();
    expect(m.defines.CEL_RIM).toBeDefined();
    expect(m.defines.CEL_SPECULAR).toBeUndefined();
    expect(m.defines.CEL_MAP).toBeUndefined();
    m.specular = 0.5;
    expect(m.defines.CEL_SPECULAR).toBeDefined();
    m.mapTexture = new THREE.Texture();
    expect(m.defines.CEL_MAP).toBeDefined();
    expect(m.fragmentShader).toContain('layout(location = 1) out highp vec4 gNormal');
  });

  it('cor mutável e máscara padrão 0 em transparente', () => {
    const m = new CelMaterial({ color: 'white', transparent: true, opacity: 0.4 });
    m.color.set('#00ff00');
    expect(m.uniforms.uColor.value.g).toBeCloseTo(1);
    expect(m.edgeMask).toBe(0);
    expect(new CelMaterial().edgeMask).toBe(1);
  });
});

describe('round 2: névoa em degraus, queda do contorno, conversor', () => {
  it('uFogSteps é global (padrão 3) e ligado por referência no cel e no contorno', () => {
    expect(celUniforms.uFogSteps.value).toBe(3);
    const m = new CelMaterial();
    expect(m.uniforms.uFogSteps).toBe(celUniforms.uFogSteps);
    expect(m.fragmentShader).toContain('floor( fogFactor * uFogSteps )');
    expect(m.fragmentShader).not.toContain('#include <fog_fragment>');
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), m);
    const om = addOutline(mesh).material as THREE.ShaderMaterial;
    expect(om.uniforms.uFogSteps).toBe(celUniforms.uFogSteps);
    expect(om.uniforms.uOutlineFadeStart).toBe(celUniforms.uOutlineFadeStart);
    expect(om.uniforms.uOutlineMinScale.value).toBeCloseTo(0.35);
    expect(om.vertexShader).toContain('uOutlineMinScale');
  });

  it('celify não inventa reflexo/especular de PBR por padrão e aceita edgeMask', () => {
    const paint = new THREE.MeshStandardMaterial({ color: '#888', metalness: 1, roughness: 0.1 });
    const glass = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.5 });
    const a = new THREE.Mesh(new THREE.BoxGeometry(), paint);
    const b = new THREE.Mesh(new THREE.BoxGeometry(), glass);
    const g = new THREE.Group().add(a, b);
    celify(g, { edgeMask: 0 });
    const cel = a.material as unknown as CelMaterial;
    expect(cel.reflectivity).toBe(0);
    expect(cel.specular).toBe(0);
    expect(cel.defines.CEL_REFLECT).toBeUndefined();
    expect(cel.edgeMask).toBe(0);
    expect((b.material as unknown as CelMaterial).edgeMask).toBe(0);

    const c = new THREE.Mesh(new THREE.BoxGeometry(), paint.clone());
    celify(c);
    expect((c.material as unknown as CelMaterial).edgeMask).toBe(1);
  });
});

describe('contorno e celify', () => {
  it('addOutline em InstancedMesh compartilha instanceMatrix e count', () => {
    const geo = new THREE.BoxGeometry();
    const mesh = new THREE.InstancedMesh(geo, new CelMaterial(), 5);
    const outline = addOutline(mesh) as THREE.InstancedMesh;
    expect(outline.isInstancedMesh).toBe(true);
    expect(outline.instanceMatrix).toBe(mesh.instanceMatrix);
    expect(outline.count).toBe(5);
    expect(outline.geometry).toBe(geo);
    expect(geo.getAttribute(SMOOTH_NORMAL_ATTRIBUTE)).toBeDefined();
    expect(addOutline(mesh)).toBe(outline); // idempotente
    const om = outline.material as THREE.ShaderMaterial;
    expect(om.side).toBe(THREE.BackSide);
    expect(om.uniforms.uOutlinePx).toBe(celUniforms.uOutlinePx);
    expect(om.uniforms.uColor).toBe(celUniforms.uInkColor);
  });

  it('celify troca materiais nativos, preserva propriedades e pula vidro', () => {
    const root = new THREE.Group();
    const map = new THREE.Texture();
    const paint = new THREE.MeshStandardMaterial({ color: '#3366ff', map, metalness: 0.8, roughness: 0.3 });
    const glass = new THREE.MeshPhysicalMaterial({ color: '#aaccff', transparent: true, opacity: 0.3 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(), paint);
    const body2 = new THREE.Mesh(new THREE.BoxGeometry(), paint);
    const window = new THREE.Mesh(new THREE.BoxGeometry(), glass);
    root.add(body, body2, window);
    celify(root, { pbrHighlights: true });

    const cel = body.material as unknown as CelMaterial;
    expect(cel).toBeInstanceOf(CelMaterial);
    expect(body2.material).toBe(cel); // compartilhado convertido uma vez
    expect(cel.color.equals(paint.color)).toBe(true);
    expect(cel.mapTexture).toBe(map);
    expect(cel.reflectivity).toBeGreaterThan(0);
    expect(cel.rim).toBeCloseTo(0.6);
    expect(body.children.some((c) => c.userData.celOutline)).toBe(true);

    const wcel = window.material as unknown as CelMaterial;
    expect(wcel.transparent).toBe(true);
    expect(wcel.opacity).toBeCloseTo(0.3);
    expect(window.children.length).toBe(0);
  });
});
