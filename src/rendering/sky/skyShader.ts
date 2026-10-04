/**
 * Shaders GLSL3 do domo de céu cel.
 *
 * Convenções do pipeline (ver src/rendering/cel/uniforms.ts):
 * - Saída 0 = cor. Em GLSL3 o three r179 NÃO declara `pc_fragColor` nem o
 *   `#define gl_FragColor` (WebGLProgram.js só faz isso para GLSL1), então
 *   declaramos as duas saídas aqui.
 * - Saída 1 = gNormal. O céu escreve (0.5, 0.5, 1.0, 0.0): normal "olhando
 *   para a câmera" e máscara de borda 0 para o Sobel ignorar o céu.
 *
 * Ordem de composição (de trás para frente):
 *   faixas → nebulosa → estrelas → planetas → halo/sol → nuvens → chão.
 *
 * Antisserrilhado: todas as bordas duras usam a largura de 1 pixel, seja via
 * fwidth() (só em fluxo de controle uniforme) seja via uPixelAngle (ângulo de
 * um pixel, calculado na CPU), que é estável e não tem costuras.
 */

export const skyVertexShader = /* glsl */ `
out vec3 vDir;

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  // direção de visão em espaço de mundo (o domo segue a câmera, então isto é
  // praticamente a posição local, mas assim continua correto se não seguir)
  vDir = wp.xyz - cameraPosition;
  vec4 clip = projectionMatrix * viewMatrix * wp;
  // cola o domo no plano distante: nunca é recortado pelo 'far' da câmera,
  // qualquer que seja o raio (z/w constante = 0.99999 em todo o triângulo)
  clip.z = clip.w * 0.99999;
  gl_Position = clip;
}
`;

export const skyFragmentShader = /* glsl */ `
layout(location = 0) out highp vec4 pc_fragColor;
layout(location = 1) out highp vec4 gNormal;

in vec3 vDir;

// ---- compartilhados do pipeline (por referência) ----
uniform vec3 uSunDir;      // direção PARA o sol (mundo, normalizada)
uniform float uTime;
uniform vec3 uInkColor;    // cor da tinta (contorno dos planetas)
uniform float uPixelAngle; // ângulo (rad) coberto por 1 pixel no centro da tela

// ---- gradiente em faixas ----
uniform vec3 uZenith;
uniform vec3 uUpper;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform float uBands;      // 3..5
uniform float uBandCurve;  // expoente da elevação
uniform float uSunBulge;   // quanto as faixas se curvam em volta do sol

// ---- sol ----
uniform vec3 uSunColor;
uniform float uSunSize;    // raio angular
uniform vec3 uHaloColor;
uniform float uHaloStrength;

// ---- nuvens ----
uniform float uCloudCoverage;
uniform float uCloudScale;
uniform float uCloudSpeed;
uniform vec3 uCloudLit;
uniform vec3 uCloudShadow;
uniform vec3 uCloudRim;
uniform vec2 uCloudAlt;    // faixa de elevação [mín, máx]
uniform float uCloudSharp; // 0..1
uniform float uCloudShadowSize;

#ifdef USE_STARS
uniform float uStarDensity;
uniform float uStarBrightness;
#endif

#ifdef USE_NEBULA
uniform vec3 uNebulaA;
uniform vec3 uNebulaB;
uniform float uNebulaIntensity;
#endif

#ifdef USE_PLANETS
uniform vec3 uPlanetDir[2];
uniform float uPlanetSize[2];   // 0 = desligado
uniform vec3 uPlanetColor[2];
uniform vec3 uPlanetShadow[2];
uniform float uPlanetRing[2];   // 0/1
uniform vec3 uPlanetRingColor[2];
#endif

// distância do plano de projeção das nuvens: menor = mais "domo"
#define CLOUD_PLANE_OFFSET 0.18
// alongamento das nuvens na direção do vento (x)
#define CLOUD_STRETCH vec2(0.55, 1.0)

// ------------------------------------------------------------------
// utilidades
// ------------------------------------------------------------------

// borda dura com 1 unidade de transição ('aa' = tamanho de 1 pixel)
float hardEdge(float value, float threshold, float aa) {
  return clamp((value - threshold) / max(aa, 1e-6) + 0.5, 0.0, 1.0);
}

// hash sem seno (Dave Hoskins), estável em qualquer GPU
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

// ruído de valor 2D com interpolação suave
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// fbm de 3 oitavas, com rotação entre oitavas para esconder a grade
float fbm3(vec2 p) {
  const mat2 R = mat2(1.6, 1.2, -1.2, 1.6);
  float s = 0.5 * vnoise(p);
  p = R * p + vec2(17.1, 9.3);
  s += 0.25 * vnoise(p);
  p = R * p + vec2(-5.7, 21.4);
  s += 0.125 * vnoise(p);
  return s / 0.875;
}

// rampa contínua horizonte → meio → zênite, amostrada só em pontos discretos
vec3 bandRamp(float s) {
  return s < 0.5 ? mix(uHorizon, uUpper, s * 2.0) : mix(uUpper, uZenith, (s - 0.5) * 2.0);
}

#ifdef USE_NEBULA
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i);
  float n100 = hash13(i + vec3(1, 0, 0));
  float n010 = hash13(i + vec3(0, 1, 0));
  float n110 = hash13(i + vec3(1, 1, 0));
  float n001 = hash13(i + vec3(0, 0, 1));
  float n101 = hash13(i + vec3(1, 0, 1));
  float n011 = hash13(i + vec3(0, 1, 1));
  float n111 = hash13(i + vec3(1, 1, 1));
  return mix(
    mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
    mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
    u.z);
}
#endif

void main() {
  vec3 d = normalize(vDir);
  float px = uPixelAngle;
  float sunDot = dot(d, uSunDir);

  // ==================================================================
  // 1. GRADIENTE EM FAIXAS DURAS
  // t = elevação^curva, menos um "bojo" perto do sol (as faixas do
  // horizonte sobem em arco em volta do sol, bem gráfico). Cada faixa é UMA
  // cor chapada; só a borda inferior de cada faixa tem 1 px de transição.
  // Espelhado em gradient.ts (bandColor) para testes.
  // ==================================================================
  float sunProx = pow(max(sunDot, 0.0), 6.0);
  float t = clamp(pow(max(d.y, 0.0), uBandCurve) - uSunBulge * sunProx, 0.0, 1.0);
  float x = t * uBands;
  float fx = max(fwidth(x), 1e-5);
  float bi = min(floor(x), uBands - 1.0);
  vec3 col = bandRamp(bi / (uBands - 1.0));
  if (bi >= 1.0) {
    // transição de 1 px com a faixa de baixo (x - bi >= 1 na faixa do topo → sem efeito)
    float k = clamp((x - bi) / fx, 0.0, 1.0);
    col = mix(bandRamp((bi - 1.0) / (uBands - 1.0)), col, k);
  }

  // ==================================================================
  // 2. NEBULOSA: manchas de ruído 3D com dois limiares duros (A, depois B
  // por dentro), concentradas numa faixa ao longo de um grande círculo.
  // ==================================================================
#ifdef USE_NEBULA
  {
    float neb = vnoise3(d * 3.0) * 0.65 + vnoise3(d * 7.0 + 11.0) * 0.35;
    float lane = dot(d, normalize(vec3(0.35, 0.8, 0.45)));
    neb *= mix(0.6, 1.0, exp(-lane * lane * 6.0));
    float fn = max(fwidth(neb), 1e-5);
    float a = hardEdge(neb, 0.50, fn);
    float b = hardEdge(neb, 0.60, fn);
    col = mix(col, uNebulaA, a * uNebulaIntensity);
    col = mix(col, uNebulaB, b * uNebulaIntensity);
  }
#endif

  // ==================================================================
  // 3. ESTRELAS: grade em "cubemap" (face dominante), 1 estrela possível
  // por célula, posição fixa dentro da célula com margem (os raios da
  // cintilação nunca saem da célula → sem cortes). Tamanho mínimo de ~2 px
  // calculado a partir de uPixelAngle: não "rasteja" quando a câmera gira.
  // ==================================================================
#ifdef USE_STARS
  {
    vec3 ad = abs(d);
    vec2 uv;
    float m;
    float face;
    if (ad.x >= ad.y && ad.x >= ad.z) { uv = d.yz / ad.x; m = ad.x; face = d.x > 0.0 ? 0.0 : 1.0; }
    else if (ad.y >= ad.z)            { uv = d.xz / ad.y; m = ad.y; face = d.y > 0.0 ? 2.0 : 3.0; }
    else                              { uv = d.xy / ad.z; m = ad.z; face = d.z > 0.0 ? 4.0 : 5.0; }
    // projeção cúbica de ÂNGULO igual (atan): células do mesmo tamanho angular
    // em toda a face, senão as arestas do cubo ficam mais densas (linhas visíveis)
    uv = atan(uv) * 1.2732395;
    const float N = 64.0; // células por face
    vec2 g = (uv * 0.5 + 0.5) * N;
    vec2 id = floor(g) + face * 131.0;
    vec2 f = fract(g) - 0.5;
    float h = hash12(id);
    // 1 pixel em unidades de célula (ângulo igual: ~constante)
    float pc = px * N * 0.5 * 1.2732395;
    if (h < uStarDensity) {
      vec2 r2 = hash22(id + 7.7);
      vec2 pos = (r2 - 0.5) * 0.5;          // margem de 0.25 célula
      vec2 q = abs(f - pos);
      float hb = hash12(id + 3.1);           // brilho/tamanho
      float radius = pc * mix(0.9, 1.6, hb * hb * hb);
      float star = clamp((radius - length(q)) / pc + 0.5, 0.0, 1.0);
      // estrelas mais fortes ganham uma cruz de 4 pontas
      if (hb > 0.86) {
        float arm = min(radius * 4.0, 0.24);
        float sparkle = max(
          hardEdge(pc * 0.5, q.y, pc) * hardEdge(arm, q.x, pc) * (1.0 - q.x / arm),
          hardEdge(pc * 0.5, q.x, pc) * hardEdge(arm, q.y, pc) * (1.0 - q.y / arm));
        star = max(star, sparkle);
      }
      // cintilação leve (não pisca: varia ±15%)
      float tw = 0.85 + 0.15 * sin(uTime * (1.3 + 2.7 * h) + hb * 40.0);
      vec3 tint = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.92, 0.8), hash12(id + 1.9));
      float horizonFade = clamp(d.y * 8.0, 0.0, 1.0);
      col += tint * star * tw * uStarBrightness * mix(0.45, 1.0, hb) * horizonFade;
    }
  }
#endif

  // ==================================================================
  // 4. PLANETAS: discos cel com terminador duro (sombra deslocada para
  // shadowColor), contorno de tinta de 2 px e anel opcional (elipse
  // inclinada; metade de trás atrás do disco, metade da frente por cima).
  // ==================================================================
#ifdef USE_PLANETS
  for (int i = 0; i < 2; i++) {
    float sz = uPlanetSize[i];
    if (sz <= 0.0) continue; // uniforme → fluxo coerente
    vec3 pd = uPlanetDir[i];
    float front = step(0.0, dot(d, pd));
    vec3 T = normalize(cross(abs(pd.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0), pd));
    vec3 B = cross(pd, T);
    vec2 xy = vec2(dot(d, T), dot(d, B)) / sz; // em raios do planeta
    float r = length(xy);
    float pp = px / sz;                        // 1 pixel em raios

    // anel: coordenadas da elipse inclinada
    const float ct = 0.94, st = 0.34;          // rotação ~20°
    vec2 rxy = vec2(ct * xy.x + st * xy.y, -st * xy.x + ct * xy.y);
    vec2 e = vec2(rxy.x, rxy.y / 0.28);
    float re = length(e);
    float pe = pp * 2.2;                       // pixel aproximado no espaço da elipse
    float ringAll = hardEdge(re, 1.35, pe) * hardEdge(2.15, re, pe) * uPlanetRing[i] * front;
    float ringFill = hardEdge(re, 1.35 + 1.6 * pe, pe) * hardEdge(2.15 - 1.6 * pe, re, pe);
    float gap = hardEdge(re, 1.74, pe) * hardEdge(1.82, re, pe);
    vec3 ringCol = mix(uInkColor, uPlanetRingColor[i] * (1.0 - 0.35 * gap), ringFill);
    float ringFront = step(rxy.y, 0.0);

    // anel de trás
    col = mix(col, ringCol, ringAll * (1.0 - ringFront));

    // corpo
    float body = hardEdge(1.0, r, pp) * front;
    vec3 nrm = normalize(T * xy.x + B * xy.y - pd * sqrt(max(1.0 - r * r, 0.0)));
    float lam = dot(nrm, uSunDir);
    float lit = hardEdge(lam, 0.0, pp * 1.5);
    vec3 pcol = mix(uPlanetShadow[i], uPlanetColor[i], lit);
    // segunda faixa de luz (destaque chapado) no lado do sol
    pcol = mix(pcol, min(uPlanetColor[i] * 1.25 + 0.04, vec3(1.0)), hardEdge(lam, 0.72, pp * 2.0));
    // listras de gigante gasoso (só nos planetas com anel)
    float stripe = hardEdge(sin(rxy.y * 9.0), 0.55, pp * 9.0) * uPlanetRing[i];
    pcol *= 1.0 - 0.12 * stripe;
    // contorno de tinta (2 px por dentro da borda)
    float ink = hardEdge(r, 1.0 - 2.0 * pp, pp);
    pcol = mix(pcol, uInkColor, ink);
    col = mix(col, pcol, body);

    // anel da frente
    col = mix(col, ringCol, ringAll * ringFront);
  }
#endif

  // ==================================================================
  // 5. SOL: disco duro + halo chapado + um anel fino concêntrico.
  // Nada de bloom: tudo são bordas de 1 px (via uPixelAngle).
  // ==================================================================
  {
    float sd = length(d - uSunDir); // ≈ ângulo até o sol (corda)
    float halo = hardEdge(uSunSize * 2.3, sd, px);
    float ringW = max(uSunSize * 0.16, px * 1.5);
    float ring = hardEdge(sd, uSunSize * 3.3 - ringW, px) * hardEdge(uSunSize * 3.3, sd, px);
    // mistura 'screen': o halo clareia o céu sem sujar de cinza (azul + amarelo)
    col = 1.0 - (1.0 - col) * (1.0 - uHaloColor * (halo * uHaloStrength));
    col = 1.0 - (1.0 - col) * (1.0 - uHaloColor * (ring * min(uHaloStrength * 1.8, 1.0)));
    float disc = hardEdge(uSunSize, sd, px);
    col = mix(col, uSunColor, disc);
  }

  // ==================================================================
  // 6. NUVENS CEL CHAPADAS
  // Projeção num plano (d.xz / (d.y + offset)) dá a sensação de domo.
  // fbm de 3 oitavas → limiar duro (forma). Segunda amostra deslocada para
  // longe do sol separa lado iluminado / sombra (forma deslocada de si
  // mesma, como uma segunda passada de marcador). Terceira amostra fina
  // dá o traço de borda no lado do sol. Perto do horizonte a cobertura cai
  // (formas encolhem, borda continua dura) para não esticar.
  // ==================================================================
  // ramo só abaixo do horizonte (aí a cobertura já é 0, então derivadas
  // indefinidas nos quads da fronteira não aparecem): economiza o fbm no chão
  if (d.y > -0.01) {
    float dy = max(d.y, 0.0);
    float lo = smoothstep(uCloudAlt.x, uCloudAlt.x + 0.06, dy);
    float hi = uCloudAlt.y >= 0.999 ? 1.0 : 1.0 - smoothstep(uCloudAlt.y - 0.12, uCloudAlt.y, dy);
    float cov = uCloudCoverage * lo * hi * step(0.0, d.y);
    // limiar: cobertura 0 → nada passa; cobertura 1 → quase tudo
    float thr = mix(1.02, 0.26, cov);

    vec2 p = d.xz / (dy + CLOUD_PLANE_OFFSET) * uCloudScale * CLOUD_STRETCH;
    vec2 q = p + vec2(1.0, 0.25) * (uTime * uCloudSpeed);
    float n0 = fbm3(q);
    // largura da borda: 1 px (nitidez 1) até ~2 px (nitidez 0)
    float w = max(fwidth(n0), 1e-5) * mix(1.6, 0.6, uCloudSharp);
    float shape = smoothstep(thr - w, thr + w, n0);

    if (shape > 0.0 && uCloudCoverage > 0.001) {
      // direção "para o sol" no plano das nuvens, com viés para o zênite
      // (lado de cima das nuvens claro, lado de baixo escuro)
      vec2 sunP = uSunDir.xz / (max(uSunDir.y, 0.02) + CLOUD_PLANE_OFFSET) * uCloudScale * CLOUD_STRETCH;
      vec2 toSun = sunP - p;
      vec2 u = toSun / max(length(toSun), 1e-3);
      vec2 up = -p / max(length(p), 1e-3);
      u = normalize(u + up * 0.8 + vec2(0.0, 1e-3));

      // lado iluminado: o ponto deslocado para LONGE do sol ainda é nuvem
      float off = mix(0.08, 0.35, uCloudShadowSize);
      float litMask = smoothstep(thr - w, thr + w, fbm3(q - u * off));
      vec3 cc = mix(uCloudShadow, uCloudLit, litMask);

      // traço de borda: o ponto deslocado um pouco PARA o sol já é céu
      float rim = 1.0 - smoothstep(thr - w, thr + w, fbm3(q + u * 0.035));
      cc = mix(cc, uCloudRim, rim * litMask);

      col = mix(col, cc, shape);
    }
  }

  // ==================================================================
  // 7. CHÃO: abaixo do horizonte, cor chapada (o terreno cobre quase tudo).
  // ==================================================================
  float above = clamp(d.y / max(fwidth(d.y), 1e-6) + 0.5, 0.0, 1.0);
  col = mix(uGround, col, above);

  pc_fragColor = linearToOutputTexel(vec4(col, 1.0));
  // normal "de frente" + máscara 0: o Sobel ignora o céu
  gNormal = vec4(0.5, 0.5, 1.0, 0.0);
}
`;
