/**
 * Tipos de dados do céu cel. Tudo é dado puro (cores em hex), para poder
 * viver em presets, ser serializado e ser testado sem WebGL.
 */

/** Cor em hex CSS, ex.: '#1d3fa8'. */
export type HexColor = string;

export type SkyCloudStyle = {
  /** fração do céu coberta por nuvens, 0..1 */
  coverage: number;
  /** escala do ruído no plano de projeção (maior = nuvens menores) */
  scale: number;
  /** velocidade de deriva (unidades do plano por segundo) */
  speed: number;
  /** tom do lado iluminado (virado para o sol) */
  litColor: HexColor;
  /** tom do lado em sombra */
  shadowColor: HexColor;
  /** traço fino na borda virada para o sol */
  rimColor: HexColor;
  /** faixa de elevação (d.y, 0 = horizonte, 1 = zênite) onde há nuvens: [mín, máx] */
  altitude: [number, number];
  /** 0..1: 1 = borda de 1 px, 0 = borda um pouco mais larga (~2 px) */
  sharpness: number;
  /** espessura da sombra (0..1, deslocamento da segunda amostra) */
  shadowSize?: number;
};

export type SkyStars = {
  /** estrelas por célula da grade, 0..1 */
  density: number;
  /** brilho multiplicador, 0..2 */
  brightness: number;
};

export type SkyNebula = {
  colorA: HexColor;
  colorB: HexColor;
  /** 0..1, opacidade das manchas sobre o fundo */
  intensity: number;
};

export type SkyPlanet = {
  /** direção (mundo) até o centro do planeta; não precisa estar normalizada */
  dir: [number, number, number];
  /** raio angular em radianos */
  size: number;
  color: HexColor;
  shadowColor: HexColor;
  ring?: boolean;
  /** cor do anel (padrão: mistura de color com branco) */
  ringColor?: HexColor;
};

export type SkyStyle = {
  zenith: HexColor;
  upper: HexColor;
  horizon: HexColor;
  /** cor chapada abaixo do horizonte */
  ground: HexColor;
  /** número de faixas duras entre horizonte e zênite (3..5) */
  bands: number;
  /**
   * Curva de distribuição das faixas: expoente aplicado à elevação.
   * < 1 deixa as faixas perto do horizonte mais finas. Padrão 0.6.
   */
  bandCurve?: number;
  /** quanto as faixas se curvam em volta do sol (0 = faixas retas). Padrão 0.15. */
  sunBulge?: number;
  sunColor: HexColor;
  /** raio angular do disco solar em radianos */
  sunSize: number;
  haloColor: HexColor;
  /** opacidade do halo chapado, 0..1. Padrão 0.35. */
  haloStrength?: number;
  cloud: SkyCloudStyle;
  /** reflexo de lente gráfico (componente SunFlare) */
  flare: boolean;
  stars?: SkyStars;
  nebula?: SkyNebula;
  planets?: SkyPlanet[];
};

/** Chaves dos presets disponíveis. */
export type SkyPresetId =
  | 'clear-day'
  | 'sunset'
  | 'rain-light'
  | 'rain-heavy'
  | 'fog'
  | 'storm'
  | 'snow'
  | 'space';
