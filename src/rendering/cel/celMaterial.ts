import * as THREE from 'three';
import { CEL_FRAGMENT_OUTPUTS } from './glsl';
import { installDefaultRamp } from './ramp';
import { celUniforms } from './uniforms';

export type CelMaterialOptions = {
  color?: THREE.ColorRepresentation;
  /** decalques / linhas de painel, multiplicado sobre a cor (canal uv) */
  map?: THREE.Texture | null;
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
  /** luz de borda dura (0..1). Use ~0.6 em veículos, 0 em terreno. Padrão 0. */
  rim?: number;
  /** brilho especular em faixa dura (0..1). Padrão 0 (desligado). */
  specular?: number;
  /** expoente do especular; quanto maior, menor a mancha. Padrão 48. */
  shininess?: number;
  /** reflexo falso em faixas céu/horizonte/chão (0..1). Padrão 0. */
  reflect?: number;
  /** cor chapada (pintura de pista, placas): sem luz, mas com névoa e MRT */
  unlit?: boolean;
  vertexColors?: boolean;
  side?: THREE.Side;
  transparent?: boolean;
  opacity?: number;
  fog?: boolean;
  /**
   * 1 = participa do Sobel do pós-processo, 0 = ignorado.
   * Padrão: 1, ou 0 quando `transparent` (vidro não deve gerar traço; com
   * máscara 0 e blending normal o G-buffer embaixo fica intacto).
   */
  edgeMask?: 0 | 1;
  flatShading?: boolean;
  /** depthWrite explícito (padrão do three: true) */
  depthWrite?: boolean;
  name?: string;
};

/** peso da luz ambiente hemisférica somada à luz do sol */
const AMBIENT_WEIGHT = 0.35;

const vertexShader = /* glsl */ `
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <clipping_planes_pars_vertex>

// vetor do ponto até a câmera, em espaço de câmera (= -mvPosition)
varying vec3 vViewPosition;
#if !defined( FLAT_SHADED ) && !defined( CEL_FLAT )
  varying vec3 vNormal;
#endif
#ifdef CEL_MAP
  uniform mat3 uMapTransform;
  varying vec2 vMapUv;
#endif

void main() {
#ifdef CEL_MAP
  vMapUv = (uMapTransform * vec3(uv, 1.0)).xy;
#endif

  // cor por vértice e instanceColor (USE_COLOR / USE_INSTANCING_COLOR são
  // definidos pelo three a partir de material.vertexColors e InstancedMesh)
  #include <color_vertex>

  // normal: objectNormal -> transformedNormal (espaço de câmera). O chunk já
  // aplica instanceMatrix (USE_INSTANCING) e inverte em BackSide (FLIP_SIDED).
  #include <beginnormal_vertex>
  #include <defaultnormal_vertex>
#if !defined( FLAT_SHADED ) && !defined( CEL_FLAT )
  vNormal = normalize(transformedNormal);
#endif

  // posição: transformed -> mvPosition -> gl_Position (com instanceMatrix)
  #include <begin_vertex>
  #include <project_vertex>
  #include <clipping_planes_vertex>

  vViewPosition = -mvPosition.xyz;
  #include <fog_vertex>
}
`;

const fragmentShader = /* glsl */ `
${CEL_FRAGMENT_OUTPUTS}

#include <common>
#include <color_pars_fragment>
#include <fog_pars_fragment>
#include <clipping_planes_pars_fragment>

uniform vec3 uColor;
uniform vec3 uEmissive;
uniform float uOpacity;
uniform float uEdgeMask;

// globais (celUniforms, compartilhados por referência)
uniform sampler2D uRamp;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyAmbient;
uniform vec3 uGroundAmbient;
uniform vec3 uShadowTint;
uniform vec3 uRimColor;
uniform vec3 uReflectSky;
uniform vec3 uReflectHorizon;
uniform vec3 uReflectGround;

uniform float uRimStrength;
uniform float uSpecular;
uniform float uShininess;
uniform float uReflect;

#ifdef CEL_MAP
  uniform sampler2D uMap;
  varying vec2 vMapUv;
#endif

varying vec3 vViewPosition;
#if !defined( FLAT_SHADED ) && !defined( CEL_FLAT )
  varying vec3 vNormal;
#endif

void main() {
  #include <clipping_planes_fragment>

  // ---- cor base ----------------------------------------------------------
  vec3 base = uColor;
  float alpha = uOpacity;
#ifdef CEL_MAP
  vec4 texel = texture(uMap, vMapUv);
  base *= texel.rgb;
  alpha *= texel.a;
#endif
#if defined( USE_COLOR_ALPHA )
  base *= vColor.rgb;
  alpha *= vColor.a;
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
  base *= vColor;
#endif

  // ---- normal em espaço de câmera ----------------------------------------
#if defined( FLAT_SHADED ) || defined( CEL_FLAT )
  // normal da face pelas derivadas da posição (mesma convenção do three)
  vec3 N = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
#else
  vec3 N = normalize(vNormal);
  #ifdef DOUBLE_SIDED
    N *= gl_FrontFacing ? 1.0 : -1.0;
  #endif
#endif

  // vetor para a câmera (ortográfica: constante)
  vec3 V = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(vViewPosition);

  vec3 col;

#ifdef CEL_UNLIT
  // cor chapada: pintura de pista, placas
  col = base;
#else
  // sol em espaço de câmera. Direção (w = 0): só a rotação da viewMatrix.
  vec3 L = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
  float NdotL = dot(N, L);

  // half-lambert -> rampa em degraus (NearestFilter): é aqui que nascem as
  // faixas duras. Nada de interpolação entre faixas.
  float h = NdotL * 0.5 + 0.5;
  float band = texture(uRamp, vec2(h, 0.5)).r;

  // normal em espaço de mundo: a inversa da rotação da view é a transposta,
  // e vec * mat multiplica pela transposta.
  vec3 Nw = (vec4(N, 0.0) * viewMatrix).xyz;

  // ambiente hemisférico em DOIS degraus (céu/chão) em vez de gradiente:
  // gradiente suave denunciaria o "3D realista" no lado da sombra.
  vec3 hemi = mix(uGroundAmbient, uSkyAmbient, step(-0.3, Nw.y));

  // sombra nunca é só "mais escuro": desloca a cor para uShadowTint
  col = base * (mix(uShadowTint, uSunColor, band) + hemi * ${AMBIENT_WEIGHT.toFixed(2)});

  #ifdef CEL_REFLECT
    // reflexo falso: só a altura (y de mundo) do vetor refletido escolhe
    // entre três cores, com degraus duros. Nunca cubemap.
    vec3 Rw = (vec4(reflect(-V, N), 0.0) * viewMatrix).xyz;
    vec3 refl = mix(uReflectGround, uReflectHorizon, step(-0.04, Rw.y));
    refl = mix(refl, uReflectSky, step(0.10, Rw.y));
    // o reflexo também respeita as faixas de luz (não brilha igual na sombra)
    col = mix(col, refl * (0.55 + 0.45 * band), uReflect);
  #endif

  #ifdef CEL_SPECULAR
    // especular Blinn em degrau: mancha de bordas duras, só no lado iluminado
    vec3 H = normalize(L + V);
    float spec = step(0.5, pow(max(dot(N, H), 0.0), uShininess));
    spec *= step(0.52, h);
    col += uSunColor * spec * uSpecular;
  #endif

  #ifdef CEL_RIM
    // luz de borda: Fresnel com limiar duro em 0.6, transição de ~1 px
    // (fwidth) — nunca um degradê. Usa a direção de visão "ortográfica"
    // (0,0,1) em vez do V por pixel: assim uma face PLANA tem fresnel
    // constante e acende inteira ou não acende (com o V por pixel o limiar
    // cortava faces planas de low-poly com uma curva no meio). Em malhas
    // suaves continua caindo na silhueta. Mais forte no lado iluminado.
    float fresnel = 1.0 - max(N.z, 0.0);
    float fw = max(fwidth(fresnel), 1e-4);
    float rim = smoothstep(0.6 - fw, 0.6 + fw, fresnel) * (0.35 + 0.65 * band) * uRimStrength;
    col += uRimColor * rim;
  #endif
#endif

  // emissivo entra sem sombreamento (luzes, neon)
  col += uEmissive;

  gl_FragColor = vec4(col, alpha);

  // mesma ordem dos materiais nativos do three
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>

  // G-buffer: normal de câmera codificada + máscara de borda
  gNormal = vec4(N * 0.5 + 0.5, uEdgeMask);
}
`;

/** Nomes dos uniforms globais que TODO CelMaterial liga por referência. */
const SHARED_KEYS = [
  'uRamp',
  'uSunDir',
  'uSunColor',
  'uSkyAmbient',
  'uGroundAmbient',
  'uShadowTint',
  'uRimColor',
  'uReflectSky',
  'uReflectHorizon',
  'uReflectGround',
] as const;

type CelOwnUniforms = {
  uColor: THREE.IUniform<THREE.Color>;
  uEmissive: THREE.IUniform<THREE.Color>;
  uOpacity: THREE.IUniform<number>;
  uEdgeMask: THREE.IUniform<number>;
  uRimStrength: THREE.IUniform<number>;
  uSpecular: THREE.IUniform<number>;
  uShininess: THREE.IUniform<number>;
  uReflect: THREE.IUniform<number>;
  uMap: THREE.IUniform<THREE.Texture | null>;
  uMapTransform: THREE.IUniform<THREE.Matrix3>;
};

/** Liga (por referência) os uniforms globais em `uniforms`. */
function linkShared(uniforms: Record<string, THREE.IUniform>): void {
  for (const key of SHARED_KEYS) uniforms[key] = celUniforms[key];
}

/**
 * Material cel do pipeline: rampa em degraus, sombra matizada, ambiente
 * hemisférico, rim/especular/reflexo em faixas duras, névoa do three,
 * instancing, cor por vértice, e as duas saídas MRT (cor + gNormal).
 */
export class CelMaterial extends THREE.ShaderMaterial {
  readonly isCelMaterial = true;
  declare uniforms: Record<string, THREE.IUniform> & CelOwnUniforms;

  constructor(options: CelMaterialOptions = {}) {
    installDefaultRamp();

    const transparent = options.transparent ?? false;
    const own: CelOwnUniforms = {
      uColor: { value: new THREE.Color(options.color ?? 0xffffff) },
      uEmissive: {
        value: new THREE.Color(options.emissive ?? 0x000000).multiplyScalar(options.emissiveIntensity ?? 1),
      },
      uOpacity: { value: options.opacity ?? 1 },
      uEdgeMask: { value: options.edgeMask ?? (transparent ? 0 : 1) },
      uRimStrength: { value: options.rim ?? 0 },
      uSpecular: { value: options.specular ?? 0 },
      uShininess: { value: options.shininess ?? 48 },
      uReflect: { value: options.reflect ?? 0 },
      uMap: { value: options.map ?? null },
      uMapTransform: { value: new THREE.Matrix3() },
    };

    // merge CLONA; por isso os globais são religados depois
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]) as Record<string, THREE.IUniform>;
    Object.assign(uniforms, own);
    linkShared(uniforms);

    super({
      name: options.name ?? 'CelMaterial',
      glslVersion: THREE.GLSL3,
      uniforms,
      vertexShader,
      fragmentShader,
      fog: options.fog ?? true,
      transparent,
      side: options.side ?? THREE.FrontSide,
      vertexColors: options.vertexColors ?? false,
    });
    this.opacity = options.opacity ?? 1;
    if (options.depthWrite !== undefined) this.depthWrite = options.depthWrite;

    this.defines = {};
    this.setFlag('CEL_UNLIT', options.unlit ?? false);
    this.setFlag('CEL_FLAT', options.flatShading ?? false);
    this.syncFeatureDefines();
  }

  // ---- acessores ----------------------------------------------------------

  /** cor base (o próprio Color do uniform: pode mutar com .set()) */
  get color(): THREE.Color {
    return this.uniforms.uColor.value;
  }
  set color(c: THREE.Color) {
    this.uniforms.uColor.value.copy(c);
  }

  /** emissivo já multiplicado pela intensidade */
  get emissive(): THREE.Color {
    return this.uniforms.uEmissive.value;
  }
  set emissive(c: THREE.Color) {
    this.uniforms.uEmissive.value.copy(c);
  }

  /** textura multiplicada sobre a cor (não se chama `map` de propósito: o
   *  three injeta USE_MAP/MAP_UV em qualquer material com `.map`) */
  get mapTexture(): THREE.Texture | null {
    return this.uniforms.uMap.value;
  }
  set mapTexture(t: THREE.Texture | null) {
    this.uniforms.uMap.value = t;
    this.syncFeatureDefines();
  }

  get rim(): number {
    return this.uniforms.uRimStrength.value;
  }
  set rim(v: number) {
    this.uniforms.uRimStrength.value = v;
    this.syncFeatureDefines();
  }

  get specular(): number {
    return this.uniforms.uSpecular.value;
  }
  set specular(v: number) {
    this.uniforms.uSpecular.value = v;
    this.syncFeatureDefines();
  }

  get shininess(): number {
    return this.uniforms.uShininess.value;
  }
  set shininess(v: number) {
    this.uniforms.uShininess.value = v;
  }

  get reflectivity(): number {
    return this.uniforms.uReflect.value;
  }
  set reflectivity(v: number) {
    this.uniforms.uReflect.value = v;
    this.syncFeatureDefines();
  }

  get edgeMask(): number {
    return this.uniforms.uEdgeMask.value;
  }
  set edgeMask(v: number) {
    this.uniforms.uEdgeMask.value = v;
  }

  /** normal de face pelas derivadas (low-poly facetado). Usa define próprio:
   *  ShaderMaterial do r179 não tem o campo flatShading nos tipos. */
  get flatShading(): boolean {
    return this.defines?.CEL_FLAT !== undefined;
  }
  set flatShading(v: boolean) {
    this.setFlag('CEL_FLAT', v);
  }

  get unlit(): boolean {
    return this.defines.CEL_UNLIT !== undefined;
  }
  set unlit(v: boolean) {
    this.setFlag('CEL_UNLIT', v);
  }

  // ---- internos -----------------------------------------------------------

  /** liga/desliga um define e só marca recompilação se mudou de fato */
  private setFlag(name: string, on: boolean): void {
    if (!this.defines) this.defines = {};
    const has = this.defines[name] !== undefined;
    if (has === on) return;
    if (on) this.defines[name] = '';
    else delete this.defines[name];
    this.needsUpdate = true;
  }

  /** remove do shader o código de recursos com força 0 */
  private syncFeatureDefines(): void {
    const u = this.uniforms;
    this.setFlag('CEL_MAP', !!u.uMap.value);
    this.setFlag('CEL_RIM', u.uRimStrength.value > 0);
    this.setFlag('CEL_SPECULAR', u.uSpecular.value > 0);
    this.setFlag('CEL_REFLECT', u.uReflect.value > 0);
  }

  /**
   * Chamado pelo three antes de desenhar cada objeto com este material
   * (antes do upload de uniforms): sincroniza `opacity` e a transformação de
   * UV da textura (repeat/offset/rotation).
   */
  onBeforeRender(): void {
    const u = this.uniforms;
    u.uOpacity.value = this.opacity;
    const map = u.uMap.value;
    if (map) {
      if (map.matrixAutoUpdate) map.updateMatrix();
      u.uMapTransform.value.copy(map.matrix);
    }
  }

  copy(source: THREE.ShaderMaterial): this {
    super.copy(source);
    // ShaderMaterial.copy clona os uniforms; religa os globais
    linkShared(this.uniforms);
    // cloneUniforms também clona texturas; o decalque deve ser o mesmo objeto
    const srcMap = (source.uniforms as Partial<CelOwnUniforms>).uMap?.value;
    if (srcMap !== undefined && this.uniforms.uMap) this.uniforms.uMap.value = srcMap;
    return this;
  }
}

export function createCelMaterial(options: CelMaterialOptions = {}): CelMaterial {
  return new CelMaterial(options);
}

export function isCelMaterial(m: unknown): m is CelMaterial {
  return !!m && (m as { isCelMaterial?: boolean }).isCelMaterial === true;
}
