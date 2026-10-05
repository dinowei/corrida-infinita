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

/**
 * Névoa cel em DEGRAUS, substituto de <fog_fragment> (mesma fórmula do three
 * para Fog/FogExp2, depois quantizada em uFogSteps faixas duras). Use
 * CEL_FOG_PARS_FRAGMENT junto de <fog_pars_fragment> e ligue
 * celUniforms.uFogSteps no material. Mesma ordem do three: depois do
 * colorspace.
 */
export const CEL_FOG_PARS_FRAGMENT = /* glsl */ `
uniform float uFogSteps;
`;

export const CEL_FOG_FRAGMENT = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  // floor: a faixa mais próxima fica sem névoa; cada faixa é um plano de
  // valor chapado, com borda dura (leitura de profundidade "pintada")
  if ( uFogSteps > 0.5 ) fogFactor = floor( fogFactor * uFogSteps ) / uFogSteps;
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif
`;

/** Só a saída de cor (passes de tela cheia que não alimentam o G-buffer). */
export const SINGLE_FRAGMENT_OUTPUT = /* glsl */ `
layout(location = 0) out highp vec4 pc_fragColor;
#define gl_FragColor pc_fragColor
`;
