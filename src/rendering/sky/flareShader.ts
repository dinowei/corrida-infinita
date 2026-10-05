/** Shaders GLSL3 do reflexo de lente gráfico (ver SunFlare.tsx). */

export const flareVertexShader = /* glsl */ `
in float aT;
in float aSize;
in float aShape;
in vec3 aColor;
in float aAlpha;

uniform vec2 uSunNdc;
uniform float uAspect;

out vec2 vLocal;
flat out float vShape;
out vec3 vColor;
out float vAlpha;

void main() {
  vLocal = position.xy;           // quad -1..1
  vShape = aShape;
  vColor = aColor;
  vAlpha = aAlpha;
  vec2 center = uSunNdc * aT;     // linha sol → centro → além
  vec2 p = center + position.xy * aSize * vec2(1.0 / uAspect, 1.0) * 2.0;
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

export const flareFragmentShader = /* glsl */ `
layout(location = 0) out highp vec4 pc_fragColor;
layout(location = 1) out highp vec4 gNormal;

in vec2 vLocal;
flat in float vShape;
in vec3 vColor;
in float vAlpha;

uniform vec3 uTint;
uniform float uFade;

void main() {
  vec2 q = abs(vLocal);
  // distância "de forma": disco = raio; hexágono = SDF de hexágono regular
  float dist = vShape > 0.5 && vShape < 1.5
    ? max(dot(q, vec2(0.8660254, 0.5)), q.y)
    : length(vLocal);
  float aa = max(fwidth(dist), 1e-4);
  float inside = clamp((0.95 - dist) / aa + 0.5, 0.0, 1.0);
  // contorno fino mais forte (traço de borda)
  float edge = inside * clamp((dist - (0.95 - 3.0 * aa)) / aa + 0.5, 0.0, 1.0);
  float a;
  if (vShape > 1.5) {
    a = edge * 1.6;               // anel: só o contorno
  } else {
    a = inside * 0.55 + edge * 0.9; // preenchimento chapado + borda
  }
  a *= vAlpha * uFade;
  if (a <= 0.001) discard;
  vec3 c = vColor * uTint;
  pc_fragColor = vec4(linearToOutputTexel(vec4(c, 1.0)).rgb, a);
  gNormal = vec4(0.0); // aditivo com alfa 0: não altera normais/máscara
}
`;
