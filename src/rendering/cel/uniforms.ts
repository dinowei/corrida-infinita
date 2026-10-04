import * as THREE from 'three';

/**
 * Uniforms globais do pipeline cel, compartilhados por REFERÊNCIA entre todos
 * os materiais cel, contornos, céu e pós-processo. Atualizar um valor aqui
 * atualiza a cena inteira sem recompilar shader.
 *
 * Convenções do pipeline (todo material da cena deve segui-las):
 * - GLSL3. Saída 0 = cor final (sRGB/linear conforme three), saída 1 =
 *   `gNormal`: normal em espaço de câmera codificada em rgb (n * 0.5 + 0.5)
 *   e alfa = máscara de borda (1 = participa do Sobel, 0 = ignorar; usado
 *   pelo céu, pela chuva e pelo traço de casco invertido para não duplicar
 *   linhas).
 * - Fragment outputs extras sem attachment são descartados pelo WebGL2, então
 *   os materiais sempre escrevem as duas saídas, com ou sem MRT ligado.
 */
export const celUniforms = {
  /** direção PARA o sol, em espaço de mundo, normalizada */
  uSunDir: { value: new THREE.Vector3(0.4, 0.75, -0.5).normalize() },
  uSunColor: { value: new THREE.Color('#fff4e0') },
  /** luz ambiente vinda do céu (faces viradas para cima) */
  uSkyAmbient: { value: new THREE.Color('#8fb3ff') },
  /** luz ambiente rebatida do chão (faces viradas para baixo) */
  uGroundAmbient: { value: new THREE.Color('#5a4a6a') },
  /** matiz das sombras: sombra cel nunca é só "mais escuro", é deslocada para esta cor */
  uShadowTint: { value: new THREE.Color('#4a3f8c') },
  /** cor da luz de borda (Fresnel) */
  uRimColor: { value: new THREE.Color('#fff2d6') },
  /** reflexo falso em faixas: céu, horizonte, chão */
  uReflectSky: { value: new THREE.Color('#bfe3ff') },
  uReflectHorizon: { value: new THREE.Color('#ffffff') },
  uReflectGround: { value: new THREE.Color('#3b3550') },
  /** rampa de luz (DataTexture com NearestFilter), indexada pelo half-lambert */
  uRamp: { value: null as THREE.Texture | null },
  /** cor do traço (tinta) */
  uInkColor: { value: new THREE.Color('#0b0d18') },
  /** espessura do traço de casco invertido, em pixels de tela (CSS px × dpr aplicado no shader) */
  uOutlinePx: { value: 2.2 },
  /** tamanho do drawing buffer em pixels — atualizado pelo renderer a cada quadro */
  uResolution: { value: new THREE.Vector2(1280, 720) },
  /** devicePixelRatio efetivo do renderer (gl.getPixelRatio()) — atualizado pelo CelRenderer */
  uPixelRatio: { value: 1 },
  uTime: { value: 0 },
};

export type CelUniforms = typeof celUniforms;
