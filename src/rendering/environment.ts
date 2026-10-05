import type { CelLighting } from '../game/contracts';
import { celUniforms, installDefaultRamp } from './cel';

/**
 * Aplica a iluminação cel de um clima aos uniforms globais. Como todos os
 * materiais compartilham esses uniforms por referência, isto reilumina a
 * cena inteira sem recompilar nada.
 */
export function applyCelLighting(light: CelLighting) {
  installDefaultRamp();
  celUniforms.uSunDir.value.set(...light.sunDir).normalize();
  celUniforms.uSunColor.value.set(light.sun);
  celUniforms.uShadowTint.value.set(light.shadowTint);
  celUniforms.uSkyAmbient.value.set(light.skyAmbient);
  celUniforms.uGroundAmbient.value.set(light.groundAmbient);
  celUniforms.uRimColor.value.set(light.rim);
  celUniforms.uInkColor.value.set(light.ink);
  celUniforms.uReflectSky.value.set(light.reflectSky);
  celUniforms.uReflectHorizon.value.set(light.reflectHorizon);
  celUniforms.uReflectGround.value.set(light.reflectGround);
}
