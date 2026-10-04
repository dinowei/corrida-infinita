import * as THREE from 'three';

/**
 * Ponto de encontro entre o render e as ferramentas de captura: os modos
 * registram o objeto do jogador aqui e respeitam `cameraOverride` quando ele
 * está ativo (o harness de screenshots posiciona a câmera em vistas fixas).
 * Em produção nada disso é usado — `active` fica sempre falso.
 */
export const devRig = {
  player: null as THREE.Object3D | null,
  override: {
    active: false,
    position: new THREE.Vector3(),
    target: new THREE.Vector3(),
    fov: 55,
  },
};

export function registerPlayer(object: THREE.Object3D | null) {
  devRig.player = object;
}

/** Aplica a câmera fixa do harness. Retorna true se a câmera foi controlada aqui. */
export function applyCameraOverride(camera: THREE.Camera) {
  const o = devRig.override;
  if (!o.active) return false;
  camera.position.copy(o.position);
  camera.lookAt(o.target);
  if (camera instanceof THREE.PerspectiveCamera && camera.fov !== o.fov) {
    camera.fov = o.fov;
    camera.updateProjectionMatrix();
  }
  return true;
}
