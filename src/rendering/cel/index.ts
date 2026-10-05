/**
 * Biblioteca NPR (cel shading) do jogo.
 *
 * Como as peças se encaixam:
 * - `celUniforms` (uniforms.ts): sol, ambiente, matizes, tinta, rampa,
 *   resolução e tempo — compartilhados POR REFERÊNCIA por todos os materiais.
 *   Mudar um valor muda a cena inteira sem recompilar.
 * - `buildRamp` / `installDefaultRamp` (ramp.ts): rampa 1D em degraus
 *   (NearestFilter) que transforma o half-lambert em faixas duras.
 * - `CelMaterial` / `createCelMaterial` (celMaterial.ts): material de
 *   superfície. Escreve DUAS saídas: cor (location 0, gerida pelo three:
 *   tone mapping, sRGB, névoa) e `gNormal` (location 1: normal de câmera +
 *   máscara de borda). Sem MRT ligado, a saída 1 é descartada pelo WebGL2.
 * - `addOutline` / `createOutlineMaterial` / `computeSmoothNormals` /
 *   `<Outlined>` (outline.ts, components.tsx): traço de casco invertido com
 *   largura constante em pixels; escreve máscara 0 para o pós-processo não
 *   duplicar a linha.
 * - `<CelRenderer>` (CelRenderer.tsx) / `CelPipeline` (celPipeline.ts, sem
 *   React): assume o render do R3F. Sem bordas,
 *   desenha direto na tela. Com bordas, desenha a cena num alvo MRT
 *   (cor + normal/máscara + profundidade) e um composite de tela cheia
 *   aplica a tinta (vincos por normal, silhuetas por profundidade inversa)
 *   e a vinheta, com brilho idêntico ao caminho direto.
 * - `celify` (convert.ts): converte modelos com materiais nativos (GLB).
 *
 * Qualquer material novo da cena (céu, chuva...) deve seguir a convenção de
 * saídas: ver `CEL_FRAGMENT_OUTPUTS` em glsl.ts.
 */
export { celUniforms, type CelUniforms } from './uniforms';
export {
  buildRamp,
  buildRampData,
  sampleRampStops,
  installDefaultRamp,
  DEFAULT_RAMP_STOPS,
  type RampStop,
} from './ramp';
export { CEL_FRAGMENT_OUTPUTS, SINGLE_FRAGMENT_OUTPUT, CEL_FOG_PARS_FRAGMENT, CEL_FOG_FRAGMENT } from './glsl';
export { CelMaterial, createCelMaterial, isCelMaterial, type CelMaterialOptions } from './celMaterial';
export {
  SMOOTH_NORMAL_ATTRIBUTE,
  computeSmoothNormals,
  createOutlineMaterial,
  setOutlineThickness,
  addOutline,
  removeOutline,
  type OutlineMaterial,
  type OutlineMaterialOptions,
  type AddOutlineOptions,
} from './outline';
export { Outlined } from './components';
export { CelRenderer, type CelRendererProps } from './CelRenderer';
export { CelPipeline, type CelFrameOptions } from './celPipeline';
export { celify, celOptionsFromMaterial, type CelifyOptions } from './convert';
