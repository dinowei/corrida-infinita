import * as THREE from 'three';

/**
 * Lógica pura do reflexo de lente gráfico (sem WebGL): onde o sol cai na
 * tela e quanto o reflexo deve aparecer. Testável no Vitest.
 */

export type FlareShape = 'disc' | 'hex' | 'ring';

export type FlareElement = {
  /** posição ao longo da linha sol → centro: 1 = no sol, 0 = centro, < 0 = além do centro */
  t: number;
  /** tamanho (raio) em fração da altura da tela */
  size: number;
  shape: FlareShape;
  color: string;
  alpha: number;
};

/** Poucos elementos de borda dura: hexágonos, discos e anéis. */
export const FLARE_ELEMENTS: FlareElement[] = [
  { t: 1.0, size: 0.13, shape: 'ring', color: '#fff0c0', alpha: 0.22 },
  { t: 0.64, size: 0.045, shape: 'hex', color: '#ffd27a', alpha: 0.24 },
  { t: 0.4, size: 0.022, shape: 'disc', color: '#ffffff', alpha: 0.3 },
  { t: 0.12, size: 0.075, shape: 'hex', color: '#7fd8ff', alpha: 0.13 },
  { t: -0.24, size: 0.035, shape: 'disc', color: '#ff9ad5', alpha: 0.2 },
  { t: -0.55, size: 0.105, shape: 'hex', color: '#9a8cff', alpha: 0.11 },
  { t: -0.92, size: 0.055, shape: 'ring', color: '#7fffd0', alpha: 0.18 },
];

export type FlareState = {
  /** posição do sol em NDC (-1..1) */
  ndc: THREE.Vector2;
  /** 0..1; 0 = invisível */
  fade: number;
};

const _p = new THREE.Vector3();
const _fwd = new THREE.Vector3();

/**
 * Projeta a direção do sol na tela da câmera.
 * fade = 0 se o sol está atrás da câmera, abaixo do horizonte ou fora da tela;
 * cai suavemente perto das bordas da tela e quando o sol está baixo.
 */
export function computeFlareState(
  sunDir: THREE.Vector3,
  camera: THREE.Camera,
  out: FlareState = { ndc: new THREE.Vector2(), fade: 0 },
): FlareState {
  camera.getWorldDirection(_fwd);
  const facing = _fwd.dot(sunDir);
  if (facing <= 0.05) {
    out.fade = 0;
    return out;
  }
  _p.setFromMatrixPosition(camera.matrixWorld).addScaledVector(sunDir, 1000);
  _p.project(camera);
  out.ndc.set(_p.x, _p.y);
  const edge = Math.max(Math.abs(_p.x), Math.abs(_p.y));
  const onScreen = 1 - THREE.MathUtils.smoothstep(edge, 0.75, 1.05);
  const altitude = THREE.MathUtils.smoothstep(sunDir.y, 0.0, 0.08);
  out.fade = onScreen * altitude;
  return out;
}
