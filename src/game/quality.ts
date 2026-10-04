import type { QualityLevel, QualityProfile } from './contracts';

export const QUALITY: Record<QualityLevel, QualityProfile> = {
  low: { level: 'low', label: 'Baixa', dpr: [0.75, 1], postprocessing: false, rainDrops: 500, scenery: 0.45 },
  medium: { level: 'medium', label: 'Média', dpr: [1, 1], postprocessing: true, rainDrops: 1400, scenery: 0.75 },
  high: { level: 'high', label: 'Alta', dpr: [1, 1.5], postprocessing: true, rainDrops: 2800, scenery: 1 },
};

/**
 * Sugere um perfil pela GPU reportada pelo navegador. GPUs integradas
 * (Intel UHD/Iris, Mali, Adreno) começam em Baixa; o jogador pode mudar.
 */
export function detectQuality(): QualityLevel {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return 'low';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    if (/intel|mali|adreno|powervr|apple gpu|swiftshader|llvmpipe/i.test(renderer)) return 'low';
    return 'medium';
  } catch {
    return 'low';
  }
}
