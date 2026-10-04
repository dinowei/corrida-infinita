import * as THREE from 'three';
import { SINGLE_FRAGMENT_OUTPUT } from './glsl';
import { installDefaultRamp } from './ramp';
import { celUniforms } from './uniforms';

export type CelFrameOptions = {
  /** liga o passe MRT + traço do pós-processo. false = render direto na tela (Low) */
  edges: boolean;
  /** escala de render do passe MRT (1 = resolução cheia do drawing buffer) */
  edgeScale?: number;
  /** opacidade da tinta do pós-processo (0..1, padrão 1) */
  edgeStrength?: number;
  /** vinheta sutil (0 = desligada; ~0.25 é discreto) */
  vignette?: number;
  /** diferença mínima entre normais codificadas (= sin(ângulo/2)); 0.3 ≈ vinco de 35° */
  normalThreshold?: number;
  /** salto relativo mínimo de profundidade inversa para virar silhueta; 0.15 ≈ 15% */
  depthThreshold?: number;
};

/*
 * COR E TONE MAPPING — por que o caminho com bordas fica idêntico ao direto
 * ------------------------------------------------------------------------
 * Num render target comum o three desliga o tone mapping e grava em linear
 * (WebGLPrograms: toneMapping só se o alvo for null ou isXRRenderTarget).
 * Linear em 8 bits tem banding, e aplicar ACES depois no composite também
 * aplicaria ACES na cor da névoa (que no caminho direto entra DEPOIS do tone
 * mapping, já em sRGB) — o horizonte ficaria com outro brilho.
 *
 * Solução: marcamos o alvo MRT com `isXRRenderTarget = true` e
 * `texture.colorSpace = SRGBColorSpace`. Com isso o three compila os
 * materiais EXATAMENTE como para a tela (mesmo toneMapping, mesma saída sRGB,
 * mesma névoa, até a cor de limpeza é convertida igual — o program cache nem
 * recompila ao alternar `edges`). Para o hardware não codificar sRGB de novo,
 * forçamos `internalFormat = 'RGBA8'`: o alvo guarda os MESMOS bytes que o
 * canvas guardaria, e o blending de transparentes também acontece no mesmo
 * espaço. O composite então só copia a cor (sem tone mapping nem conversão),
 * e a única cor que ele produz — a tinta — é passada pelas mesmas funções
 * `toneMapping()` + `linearToOutputTexel()` que o three injeta (por isso o
 * material do composite fica com toneMapped = true: é o que faz o three
 * declarar essas funções; nós NÃO as aplicamos na cor da cena).
 * Efeito colateral do flag: nenhum além da escolha de color space / tone
 * mapping (conferido em three r179: WebGLPrograms, WebGLRenderer,
 * UniformsUtils.getUnlitUniformColorSpace e WebGLTextures/multisample).
 */

const compositeVertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  // triângulo de tela cheia: (-1,-1) (3,-1) (-1,3)
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const compositeFragmentShader = /* glsl */ `
${SINGLE_FRAGMENT_OUTPUT}

uniform sampler2D tColor;   // cor já pronta para exibição (sRGB, tone mapped)
uniform sampler2D tNormal;  // rgb = normal de câmera * 0.5 + 0.5, a = máscara
uniform sampler2D tDepth;   // profundidade de janela (0..1)
uniform vec2 uTexel;        // 1 / tamanho do alvo MRT

uniform float uNear;
uniform float uFar;
uniform float uOrtho;

uniform vec3 uInkColor;     // linear (celUniforms.uInkColor)
uniform float uEdgeStrength;
uniform float uVignette;
uniform float uNormalThreshold;
uniform float uDepthThreshold;
uniform float uDepthEps;

// névoa da cena, para a tinta sumir junto com a geometria
uniform float uFogMode;     // 0 = sem, 1 = linear, 2 = exp2
uniform float uFogNear;
uniform float uFogFar;
uniform float uFogDensity;

varying vec2 vUv;

// profundidade de janela -> distância positiva em espaço de câmera
float viewDepth(float d) {
  if (uOrtho > 0.5) return uNear + d * (uFar - uNear);
  return (uNear * uFar) / (uFar - d * (uFar - uNear));
}

// p é dono da fronteira com q? Cada fronteira tem UM dono, então a linha
// tem 1 px: vence o lado mais PRÓXIMO da câmera; empate de profundidade
// (vinco na mesma superfície) fica com o pixel à esquerda/abaixo
// (forward = 1 quando q está à direita/acima).
float ownsNormalEdge(vec3 np, vec3 nq, float zp, float zq, float forward) {
  float differs = step(uNormalThreshold, distance(np, nq));
  float rel = (zq - zp) / zp;
  float nearer = step(uDepthEps, rel);
  float tie = 1.0 - step(uDepthEps, abs(rel));
  return differs * max(nearer, tie * forward);
}

// vizinhança 3x3:   6 7 8
//                   3 4 5
//                   0 1 2
const vec2 OFFSETS[9] = vec2[9](
  vec2(-1.0, -1.0), vec2(0.0, -1.0), vec2(1.0, -1.0),
  vec2(-1.0,  0.0), vec2(0.0,  0.0), vec2(1.0,  0.0),
  vec2(-1.0,  1.0), vec2(0.0,  1.0), vec2(1.0,  1.0)
);

void main() {
  vec3 color = texture(tColor, vUv).rgb;

  // 9 amostras de normal+máscara e 9 de profundidade (offsets de 1 texel)
  vec4 n[9];
  float z[9];
  float mask = 1.0;
  for (int i = 0; i < 9; i++) {
    vec2 uv = vUv + OFFSETS[i] * uTexel;
    n[i] = texture(tNormal, uv);
    z[i] = viewDepth(texture(tDepth, uv).r);
    mask = min(mask, n[i].a);
  }

  // ---- bordas de normal (vincos) --------------------------------------
  // diferença direta com os 4 vizinhos + regra de dono: 1 px exato, sem a
  // linha dupla de 2 px que um Sobel puro desenha numa fronteira em degrau.
  float normalEdge = max(
    max(ownsNormalEdge(n[4].rgb, n[5].rgb, z[4], z[5], 1.0),
        ownsNormalEdge(n[4].rgb, n[7].rgb, z[4], z[7], 1.0)),
    max(ownsNormalEdge(n[4].rgb, n[3].rgb, z[4], z[3], 0.0),
        ownsNormalEdge(n[4].rgb, n[1].rgb, z[4], z[1], 0.0)));

  // ---- bordas de profundidade (silhuetas) ----------------------------
  // Usamos a profundidade INVERSA (1/z): num plano ela é LINEAR em espaço de
  // tela, então a segunda diferença (a + b - 2c) é ZERO em qualquer plano,
  // por mais rasante que seja — estrada e terreno distante não escurecem.
  // Dividir por 1/z do centro torna o limiar relativo à distância (um salto
  // de 15% conta igual a 5 m ou a 500 m). Só o lado mais próximo
  // (2c - a - b > 0) marca: a silhueta pertence ao objeto da frente, 1 px.
  float c = 1.0 / z[4];
  float d0 = 2.0 * c - 1.0 / z[3] - 1.0 / z[5];
  float d1 = 2.0 * c - 1.0 / z[1] - 1.0 / z[7];
  float d2 = 2.0 * c - 1.0 / z[0] - 1.0 / z[8];
  float d3 = 2.0 * c - 1.0 / z[2] - 1.0 / z[6];
  float depthEdge = step(uDepthThreshold, max(max(d0, d1), max(d2, d3)) / c);

  // traço duro (step), suprimido perto de céu/chuva/casco invertido
  float edge = max(normalEdge, depthEdge) * step(0.5, mask);

  // a tinta some com a névoa, como a geometria embaixo
  float fogFactor = 0.0;
  if (uFogMode > 1.5) {
    float fd = uFogDensity * z[4];
    fogFactor = 1.0 - exp(-fd * fd);
  } else if (uFogMode > 0.5) {
    fogFactor = smoothstep(uFogNear, uFogFar, z[4]);
  }

  // tinta convertida para o mesmo espaço da cor (tone mapping + sRGB)
  vec3 ink = uInkColor;
#ifdef TONE_MAPPING
  ink = toneMapping(ink);
#endif
  ink = linearToOutputTexel(vec4(ink, 1.0)).rgb;

  color = mix(color, ink, clamp(edge * uEdgeStrength * (1.0 - fogFactor), 0.0, 1.0));

  // vinheta sutil (0 no centro, 1 no canto)
  float r = length(vUv - 0.5) * 1.41421356;
  color *= 1.0 - uVignette * smoothstep(0.45, 1.0, r);

  gl_FragColor = vec4(color, 1.0);
}
`;

type EdgePipeline = {
  target: THREE.WebGLRenderTarget;
  quadScene: THREE.Scene;
  quadCamera: THREE.OrthographicCamera;
  quadGeometry: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;
};

/** fundo do G-buffer: normal "para a câmera", máscara 0 (não gera traço) */
const NORMAL_CLEAR = new Float32Array([0.5, 0.5, 1.0, 0.0]);

function createTarget(width: number, height: number): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(width, height, {
    count: 2,
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    depthBuffer: true,
    stencilBuffer: false,
    generateMipmaps: false,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthTexture: new THREE.DepthTexture(width, height, THREE.UnsignedIntType),
  });
  const [colorTex, normalTex] = target.textures;
  // cor: bytes prontos para exibição (ver comentário no topo)
  colorTex.colorSpace = THREE.SRGBColorSpace;
  colorTex.internalFormat = 'RGBA8';
  // bilinear só importa quando edgeScale < 1 (no 1:1 cai no centro do texel)
  colorTex.minFilter = THREE.LinearFilter;
  colorTex.magFilter = THREE.LinearFilter;
  colorTex.name = 'celColor';
  // normais: dado, nunca cor; nearest para o Sobel não misturar vizinhos
  normalTex.colorSpace = THREE.NoColorSpace;
  normalTex.internalFormat = 'RGBA8';
  normalTex.minFilter = THREE.NearestFilter;
  normalTex.magFilter = THREE.NearestFilter;
  normalTex.name = 'celNormal';
  if (target.depthTexture) {
    target.depthTexture.minFilter = THREE.NearestFilter;
    target.depthTexture.magFilter = THREE.NearestFilter;
  }
  // faz o three tratar o alvo como "tela" para tone mapping / color space
  (target as unknown as { isXRRenderTarget: boolean }).isXRRenderTarget = true;
  return target;
}

function createPipeline(width: number, height: number): EdgePipeline {
  const target = createTarget(width, height);

  const quadGeometry = new THREE.BufferGeometry();
  quadGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));

  const material = new THREE.ShaderMaterial({
    name: 'CelComposite',
    glslVersion: THREE.GLSL3,
    vertexShader: compositeVertexShader,
    fragmentShader: compositeFragmentShader,
    uniforms: {
      tColor: { value: target.textures[0] },
      tNormal: { value: target.textures[1] },
      tDepth: { value: target.depthTexture },
      uTexel: { value: new THREE.Vector2(1 / width, 1 / height) },
      uNear: { value: 0.1 },
      uFar: { value: 1000 },
      uOrtho: { value: 0 },
      uInkColor: celUniforms.uInkColor,
      uEdgeStrength: { value: 1 },
      uVignette: { value: 0 },
      uNormalThreshold: { value: 0.3 },
      uDepthThreshold: { value: 0.15 },
      uDepthEps: { value: 0.02 },
      uFogMode: { value: 0 },
      uFogNear: { value: 1 },
      uFogFar: { value: 1000 },
      uFogDensity: { value: 0 },
    },
    depthTest: false,
    depthWrite: false,
    // ver comentário no topo: só para o three declarar toneMapping()
    toneMapped: true,
  });

  const mesh = new THREE.Mesh(quadGeometry, material);
  mesh.frustumCulled = false;
  const quadScene = new THREE.Scene();
  quadScene.add(mesh);
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  return { target, quadScene, quadCamera, quadGeometry, material };
}

function disposePipeline(p: EdgePipeline): void {
  p.target.depthTexture?.dispose();
  p.target.dispose();
  p.quadGeometry.dispose();
  p.material.dispose();
}


const tmpSize = new THREE.Vector2();
const tmpClear = new THREE.Color();

/**
 * O quadro cel completo, independente de React (o <CelRenderer> só chama
 * isto num useFrame). Útil também para scripts de captura.
 */
export class CelPipeline {
  private edge: EdgePipeline | null = null;

  constructor() {
    installDefaultRamp();
  }

  /** desenha um quadro na tela; `time` alimenta celUniforms.uTime */
  render(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, opts: CelFrameOptions, time: number): void {
    // uniforms globais do quadro
    gl.getDrawingBufferSize(tmpSize);
    celUniforms.uResolution.value.copy(tmpSize);
    celUniforms.uPixelRatio.value = gl.getPixelRatio();
    celUniforms.uTime.value = time;

    if (!opts.edges) {
      // caminho Low: direto na tela
      gl.setRenderTarget(null);
      gl.render(scene, camera);
      return;
    }

    // ---- alvo MRT no tamanho certo ---------------------------------------
    const scale = THREE.MathUtils.clamp(opts.edgeScale ?? 1, 0.25, 1);
    const w = Math.max(1, Math.round(tmpSize.x * scale));
    const h = Math.max(1, Math.round(tmpSize.y * scale));
    let p = this.edge;
    if (!p) {
      p = this.edge = createPipeline(w, h);
    } else if (p.target.width !== w || p.target.height !== h) {
      // recria (RenderTarget.setSize não redimensiona a DepthTexture no r179)
      p.target.depthTexture?.dispose();
      p.target.dispose();
      p.target = createTarget(w, h);
      p.material.uniforms.tColor.value = p.target.textures[0];
      p.material.uniforms.tNormal.value = p.target.textures[1];
      p.material.uniforms.tDepth.value = p.target.depthTexture;
    }

    // as estatísticas (painel F3) contam os dois passes do quadro
    const autoReset = gl.info.autoReset;
    gl.info.autoReset = false;
    if (autoReset) gl.info.reset();

    const prevAutoClear = gl.autoClear;
    const prevAlpha = gl.getClearAlpha();
    gl.getClearColor(tmpClear);

    // ---- passe 1: cena -> MRT (cor + normal/máscara + profundidade) ------
    // A limpeza é manual para poder zerar o anexo de normais com máscara 0.
    // Fundo do tipo Color: o three limparia à força dentro do render, então
    // ele sai da cena por um instante e vira a cor de limpeza.
    const background = scene.background;
    const bgColor = background && (background as THREE.Color).isColor ? (background as THREE.Color) : null;
    gl.setRenderTarget(p.target);
    // reaplicar com o alvo já ligado converte a cor para o espaço do alvo
    gl.setClearColor(bgColor ?? tmpClear, bgColor ? 1 : prevAlpha);
    if (bgColor) scene.background = null;
    gl.state.buffers.color.setMask(true);
    gl.state.buffers.depth.setMask(true);
    gl.clear(true, true, true); // os dois anexos recebem a cor de fundo...
    const ctx = gl.getContext() as WebGL2RenderingContext;
    ctx.clearBufferfv(ctx.COLOR, 1, NORMAL_CLEAR); // ...e o anexo 1 vira máscara 0

    gl.autoClear = false;
    try {
      gl.render(scene, camera);
    } finally {
      if (bgColor) scene.background = background;
    }

    // ---- passe 2: composite na tela --------------------------------------
    const u = p.material.uniforms;
    u.uTexel.value.set(1 / w, 1 / h);
    const cam = camera as THREE.PerspectiveCamera | THREE.OrthographicCamera;
    u.uNear.value = cam.near;
    u.uFar.value = cam.far;
    u.uOrtho.value = (camera as THREE.OrthographicCamera).isOrthographicCamera ? 1 : 0;
    u.uEdgeStrength.value = opts.edgeStrength ?? 1;
    u.uVignette.value = opts.vignette ?? 0;
    u.uNormalThreshold.value = opts.normalThreshold ?? 0.3;
    u.uDepthThreshold.value = opts.depthThreshold ?? 0.15;
    const fog = scene.fog;
    if (fog && (fog as THREE.FogExp2).isFogExp2) {
      u.uFogMode.value = 2;
      u.uFogDensity.value = (fog as THREE.FogExp2).density;
    } else if (fog && (fog as THREE.Fog).isFog) {
      u.uFogMode.value = 1;
      u.uFogNear.value = (fog as THREE.Fog).near;
      u.uFogFar.value = (fog as THREE.Fog).far;
    } else {
      u.uFogMode.value = 0;
    }

    gl.setRenderTarget(null);
    gl.render(p.quadScene, p.quadCamera); // autoClear false: o triângulo cobre tudo

    gl.autoClear = prevAutoClear;
    gl.setClearColor(tmpClear, prevAlpha);
    gl.info.autoReset = autoReset;
  }

  /** libera os alvos MRT (ex.: ao trocar para qualidade Low) */
  releaseTargets(): void {
    if (this.edge) disposePipeline(this.edge);
    this.edge = null;
  }

  dispose(): void {
    this.releaseTargets();
  }
}
