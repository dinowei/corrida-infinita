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

import {
  CLOUD_ASPECT,
  CLOUD_BASE_JITTER,
  CLOUD_CELL,
  CLOUD_HEIGHT,
  CLOUD_MIN_PX,
  CLOUD_ROW0,
  CLOUD_ROW_GROWTH,
  CLOUD_ROWS,
  CLOUD_X_JITTER,
  CLOUD_ZENITH_FADE,
} from './clouds';

/** número JS → literal float GLSL */
const f = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

export const skyVertexShader =/* glsl */ `
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
uniform vec3 uBandColors[5]; // cor chapada de cada faixa (calculada na CPU, gradient.ts)
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

// constantes das nuvens (fonte: clouds.ts)
#ifndef PI
#define PI 3.14159265
#endif
#define TAU 6.28318531
#define CLOUD_ROWS ${CLOUD_ROWS}
#define CLOUD_G ${f(CLOUD_ROW_GROWTH)}
#define CLOUD_ROW0 ${f(CLOUD_ROW0)}
#define CLOUD_CELL ${f(CLOUD_CELL)}
#define CLOUD_MIN_PX ${f(CLOUD_MIN_PX)}
#define CLOUD_H_MIN ${f(CLOUD_HEIGHT[0])}
#define CLOUD_H_MAX ${f(CLOUD_HEIGHT[1])}
#define CLOUD_ASP_MIN ${f(CLOUD_ASPECT[0])}
#define CLOUD_ASP_MAX ${f(CLOUD_ASPECT[1])}
#define CLOUD_BASE_JITTER ${f(CLOUD_BASE_JITTER)}
#define CLOUD_X_JITTER ${f(CLOUD_X_JITTER)}
#define CLOUD_ZFADE_A ${f(CLOUD_ZENITH_FADE[0])}
#define CLOUD_ZFADE_B ${f(CLOUD_ZENITH_FADE[1])}

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


// ------------------------------------------------------------------
// nuvens: SDFs (negativo = dentro), unidades = radianos métricos
// ------------------------------------------------------------------

// Cúmulo de perfil. Origem no centro da BASE (base levemente festonada);
// h = altura, w = meia-largura,
// rnd = 3 aleatórios 0..1 (forma dos lobos).
float cumulusSdf(vec2 p, float h, float w, vec3 rnd) {
  // corpo: elipse achatada MAIS ESTREITA que os lobos (sem "prateleira":
  // a base fica mais curta que a largura máxima da nuvem)
  vec2 ab = vec2(0.8 * w, 0.3 * h);
  vec2 pe = p - vec2(0.0, 0.12 * h);
  float k = length(pe / ab);
  // distância aproximada da elipse (k-1 normalizado pelo gradiente)
  float gk = length(pe / (ab * ab));
  float s = gk > 1e-6 ? k * (k - 1.0) / gk : -min(ab.x, ab.y);
  // lobo central (o mais alto, toca h)
  float rm = h * mix(0.5, 0.62, rnd.x);
  s = min(s, length(p - vec2(w * mix(-0.18, 0.18, rnd.y), h - rm)) - rm);
  // lobos laterais, mais baixos; o da direita some em parte das nuvens (2 lobos)
  float rl = h * mix(0.3, 0.45, rnd.z);
  s = min(s, length(p - vec2(-w * 0.55, rl * 0.6 + 0.12 * h)) - rl);
  float rr = h * mix(0.28, 0.44, rnd.y) * step(0.33, rnd.x + 0.2 * rnd.z);
  s = min(s, length(p - vec2(w * 0.55, rr * 0.6 + 0.12 * h)) - max(rr, 1e-4));
  // base: corte quase reto com um leve festonado (arcos rasos pendurados)
  float t = fract(p.x / (0.4 * w) + rnd.y) * 2.0 - 1.0;
  float yCut = -0.05 * h * sqrt(max(1.0 - t * t, 0.0));
  return max(s, yCut - p.y);
}

// Teto contínuo: semiplano acima de 'base' + gomos redondos pendurados.
// 'sh' desloca o ponto avaliado (p - sh), em unidades métricas.
float deckField(float x, float e, float ce, float base, float nD, float rb, vec2 sh) {
  float cw = TAU / nD;
  float xs = x - sh.x / max(ce, 0.05);
  float es = e - sh.y;
  float s = base - es;
  float ci = floor(xs / cw);
  for (int j = -1; j <= 1; j++) {
    float cid = ci + float(j);
    float hr = hash12(vec2(mod(cid, nD), 91.0));
    float r = rb * mix(0.7, 1.25, hr);
    vec2 lp = vec2((xs - (cid + 0.5) * cw) * ce, es - base);
    s = min(s, length(lp) - r);
  }
  return s;
}

// Pinta uma nuvem com 2 tons + traço: s0 = forma, s1 = forma deslocada
// (dentro = lado iluminado), s2 = forma no ponto deslocado para o sol
// (fora = borda virada para o sol).
vec3 paintCloud(vec3 col, float s0, float s1, float s2, float aa) {
  // tudo é recortado pela máscara da PRÓPRIA nuvem (inside): sombra e
  // traço nunca saem do contorno
  float inside = clamp(-s0 / aa + 0.5, 0.0, 1.0);
  float lit = clamp(-s1 / aa + 0.5, 0.0, 1.0);
  // traço: só no lado do sol, 1 tom, e só a partir de 1 px PARA DENTRO do
  // contorno (nunca encosta na borda → não vira franja de composição)
  float deep = clamp((-s0 - aa) / aa + 0.5, 0.0, 1.0);
  float rim = clamp(s2 / aa + 0.5, 0.0, 1.0) * lit * deep;
  vec3 c = mix(uCloudShadow, uCloudLit, lit);
  c = mix(c, uCloudRim, rim);
  return mix(col, c, inside);
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
  vec3 col = uBandColors[int(bi)];
  if (bi >= 1.0) {
    // transição de 1 px com a faixa de baixo (x - bi >= 1 na faixa do topo → sem efeito)
    float k = clamp((x - bi) / fx, 0.0, 1.0);
    col = mix(uBandColors[int(bi) - 1], col, k);
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
  // 6. NUVENS CEL (cúmulos de perfil)
  // Cada nuvem: base quase reta (leve festonado), corpo em elipse achatada
  // e 2–3 lobos redondos por cima. Tons:
  //   - sombra = faixa de baixo + lado oposto ao sol: é o que fica de fora
  //     da própria forma deslocada para CIMA (e um pouco para o sol);
  //   - traço = ponto deslocado ~3 px para o sol já é céu, só por dentro.
  // Fileiras/células: ver clouds.ts (mesmos números). Sem fbm: só SDFs de
  // círculo/caixa e 1 amostra de ruído para a irregularidade do traço.
  // Bordas com 1 px via uPixelAngle (sem derivadas → ramos livres).
  // Nuvens com menos de CLOUD_MIN_PX de altura não existem: sem lascas.
  // ==================================================================
  if (uCloudCoverage > 0.001 && d.y > 0.0) {
    float e = asin(clamp(d.y, 0.0, 1.0));
    float az = atan(d.z, d.x);
    float ce = cos(e);
    float sc = max(uCloudScale, 0.05);
    float row0 = CLOUD_ROW0 / sc;
    float e0 = asin(clamp(uCloudAlt.x, 0.0, 0.99)) + 0.012;
    float eTop = asin(clamp(uCloudAlt.y, 0.0, 1.0));
    float cov = uCloudCoverage;
    float drift = uTime * uCloudSpeed;
    float aa = px * mix(1.8, 1.0, uCloudSharp);

    // direção para o sol no espaço local (azimute métrico, elevação)
    float aS = atan(uSunDir.z, uSunDir.x);
    float eS = asin(clamp(uSunDir.y, -1.0, 1.0));
    float dA = aS - az;
    dA -= TAU * floor((dA + PI) / TAU);
    vec2 toSun = normalize(vec2(dA * ce, eS - e) + vec2(0.0, 1e-4));
    float sunSide = toSun.x >= 0.0 ? 1.0 : -1.0;
    vec2 rimShift = toSun * (3.0 * px); // traço ~2 px por dentro (ver paintCloud)
    float shadowK = mix(0.6, 1.4, uCloudShadowSize);

    // irregularidade de marcador (uma amostra, reaproveitada por todas)
    float wob = vnoise(vec2(az * ce, e) * 45.0) - 0.5;

    // ---- teto contínuo (só com cobertura alta): semiplano com gomos
    // redondos pendurados embaixo; a faixa de baixo dos gomos é sombra
    float deckK = smoothstep(0.6, 1.0, cov);
    if (deckK > 0.0) {
      float deckBase = mix(1.5, 0.28, deckK);
      float rb = 0.055 / sc;
      float nD = max(3.0, floor(TAU * cos(deckBase) / (rb * 1.7)));
      float x = az + drift * 0.5;
      vec2 offD = vec2(sunSide * 0.3, 1.0) * rb * 0.7 * shadowK;
      float wd = wob * 0.15 * rb;
      float s0 = deckField(x, e, ce, deckBase, nD, rb, vec2(0.0)) + wd;
      if (s0 < 2.0 * aa) {
        float s1 = deckField(x, e, ce, deckBase, nD, rb, offD) + wd;
        float s2 = deckField(x, e, ce, deckBase, nD, rb, -rimShift) + wd;
        col = paintCloud(col, s0, s1, s2, aa);
      }
    }

    // ---- fileiras de cúmulos: primeiro a de baixo (mais distante), depois
    // a do pixel (mais perto, por cima)
    float g = CLOUD_G;
    float rowPix = floor(log(1.0 + max(e - e0, 0.0) * (g - 1.0) / row0) / log(g));
    for (int k = 1; k >= 0; k--) {
      float r = rowPix - float(k);
      if (r < 0.0 || r > float(CLOUD_ROWS) - 1.0 || e < e0) continue;
      float gr = pow(g, r);
      float sr = row0 * gr;
      float baseR = e0 + row0 * (gr - 1.0) / (g - 1.0);
      // menos nuvens perto do zênite e fora da faixa de altitude
      float rowCov = cov * (1.0 - smoothstep(CLOUD_ZFADE_A, CLOUD_ZFADE_B, baseR)) * step(baseR, eTop);
      if (rowCov <= 0.0) continue;
      float nC = max(3.0, floor(TAU * cos(min(baseR + 2.0 * sr, 1.52)) / (sr * CLOUD_CELL)));
      float cw = TAU / nC;
      // fileiras mais altas (mais perto) andam mais rápido: paralaxe
      float x = az + drift * (1.0 + 0.3 * r);
      float ci = floor(x / cw);
      for (int j = -1; j <= 1; j++) {
        float cid = ci + float(j);
        vec2 hid = vec2(mod(cid, nC), r * 17.0 + 3.0);
        float hp = hash12(hid);
        if (hp >= rowCov) continue;
        vec3 hh = vec3(hash12(hid + 11.1), hash12(hid + 23.7), hash12(hid + 37.3));
        float h = sr * mix(CLOUD_H_MIN, CLOUD_H_MAX, hh.x) * mix(0.75, 1.0, cov);
        if (h < CLOUD_MIN_PX * px) continue; // anti-lasca
        float w = h * mix(CLOUD_ASP_MIN, CLOUD_ASP_MAX, hh.y);
        float xc = (cid + 0.5 + (hh.z - 0.5) * CLOUD_X_JITTER) * cw;
        float yb = baseR + sr * CLOUD_BASE_JITTER * fract(hh.z * 7.31);
        vec2 lp = vec2((x - xc) * ce, e - yb);
        // caixa envolvente (com folga para traço e irregularidade)
        if (lp.y < -0.06 * h - 2.0 * aa || lp.y > h * 1.1 + 2.0 * aa || abs(lp.x) > w * 1.1 + 2.0 * aa) continue;
        vec3 rnd = vec3(hp / max(rowCov, 1e-3), fract(hh.y * 13.7), fract(hh.x * 29.3));
        // irregularidade só nos lobos: a base continua reta
        float wa = wob * 0.08 * h * smoothstep(0.0, 0.35 * h, lp.y);
        vec2 off = vec2(sunSide * 0.12, 0.24) * h * shadowK;
        float s0 = cumulusSdf(lp, h, w, rnd) + wa;
        float s1 = cumulusSdf(lp - off, h, w, rnd) + wa;
        float s2 = cumulusSdf(lp + rimShift, h, w, rnd) + wa;
        col = paintCloud(col, s0, s1, s2, aa);
      }
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
