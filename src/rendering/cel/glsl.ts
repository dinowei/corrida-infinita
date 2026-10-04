/**
 * Trechos GLSL compartilhados pelos materiais do pipeline cel.
 *
 * Peculiaridade do three r179 (WebGLProgram.js): para ShaderMaterial com
 * `glslVersion: THREE.GLSL3`, o three NÃO declara `pc_fragColor` nem o
 * `#define gl_FragColor pc_fragColor` (só faz isso para GLSL1). Os chunks
 * padrão (<tonemapping_fragment>, <colorspace_fragment>, <fog_fragment>)
 * escrevem em `gl_FragColor`, então nós mesmos declaramos a saída 0 com o
 * mesmo nome e o mesmo define. Como existe mais de uma saída, o GLSL ES 3.00
 * exige `layout(location = N)` em todas.
 */
export const CEL_FRAGMENT_OUTPUTS = /* glsl */ `
layout(location = 0) out highp vec4 pc_fragColor;
layout(location = 1) out highp vec4 gNormal;
#define gl_FragColor pc_fragColor
`;

/** Só a saída de cor (passes de tela cheia que não alimentam o G-buffer). */
export const SINGLE_FRAGMENT_OUTPUT = /* glsl */ `
layout(location = 0) out highp vec4 pc_fragColor;
#define gl_FragColor pc_fragColor
`;
