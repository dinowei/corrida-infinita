import * as THREE from 'three';
import { celUniforms } from './uniforms';

export type RampStop = { at: number; value: number };

/**
 * Faixas padrão, indexadas pelo half-lambert h = N·L * 0.5 + 0.5.
 *
 * Raciocínio: numa esfera, a área é uniforme em cos(θ) (Arquimedes), e
 * h = (cosθ + 1) / 2 é linear em cosθ — logo a FRAÇÃO DA ÁREA com h < t é
 * exatamente t. Isso deixa escolher os limiares direto em "porcentagem da
 * esfera":
 * - [0.00, 0.34) sombra núcleo (34% da esfera, lado bem oposto ao sol);
 * - [0.34, 0.52) sombra (18%); o terminador geométrico (N·L = 0) fica em
 *   h = 0.5, então a sombra invade um fio do lado iluminado — dá peso;
 * - [0.52, 0.72) meio-tom: a faixa do terminador, bem marcada (20%);
 * - [0.72, 1.00] luz plena: calota com θ < ~64° do sol (28%).
 * Vista de 3/4 (câmera ~60° fora do sol), a parte VISÍVEL fica com ~1/3 em
 * faixas de sombra, uma faixa de terminador clara e uma calota iluminada.
 */
export const DEFAULT_RAMP_STOPS: ReadonlyArray<RampStop> = [
  { at: 0.0, value: 0.3 },
  { at: 0.34, value: 0.52 },
  { at: 0.52, value: 0.8 },
  { at: 0.72, value: 1.0 },
];

/**
 * Valor da rampa em degrau para a coordenada u (0..1): valor da última parada
 * com `at <= u`. Antes da primeira parada vale o valor da primeira.
 * Exportado para testes e para quem quiser avaliar a rampa na CPU.
 */
export function sampleRampStops(stops: ReadonlyArray<RampStop>, u: number): number {
  if (stops.length === 0) return 1;
  const sorted = [...stops].sort((a, b) => a.at - b.at);
  let value = sorted[0].value;
  for (const stop of sorted) {
    if (stop.at <= u) value = stop.value;
    else break;
  }
  return value;
}

/**
 * Gera os bytes (R8) da rampa. Cada texel i é avaliado no seu CENTRO
 * u = (i + 0.5) / width: com NearestFilter o shader lê o texel floor(h*width),
 * então o degrau cai a no máximo meio texel do limiar pedido, sem viés.
 */
export function buildRampData(stops: ReadonlyArray<RampStop>, width = 64): Uint8Array {
  const w = Math.max(2, Math.floor(width));
  const data = new Uint8Array(w);
  for (let i = 0; i < w; i++) {
    const v = sampleRampStops(stops, (i + 0.5) / w);
    data[i] = Math.round(THREE.MathUtils.clamp(v, 0, 1) * 255);
  }
  return data;
}

/**
 * Rampa 1D em degraus (sem interpolação) para iluminação cel.
 * R8 + NearestFilter + ClampToEdge, sem mipmaps: a borda entre faixas é dura.
 */
export function buildRamp(stops: ReadonlyArray<RampStop> = DEFAULT_RAMP_STOPS, width = 64): THREE.DataTexture {
  const data = buildRampData(stops, width);
  const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat, THREE.UnsignedByteType);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.unpackAlignment = 1;
  // dado numérico, não cor: nada de decodificação sRGB
  tex.colorSpace = THREE.NoColorSpace;
  tex.name = 'celRamp';
  tex.needsUpdate = true;
  return tex;
}

/** Garante que celUniforms.uRamp tenha uma rampa (a padrão) e a devolve. */
export function installDefaultRamp(): THREE.Texture {
  if (!celUniforms.uRamp.value) celUniforms.uRamp.value = buildRamp(DEFAULT_RAMP_STOPS);
  return celUniforms.uRamp.value;
}
