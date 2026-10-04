import * as THREE from 'three';
import { celUniforms } from '../cel/uniforms';
import { clampBands, DEFAULT_BAND_CURVE, DEFAULT_SUN_BULGE } from './gradient';
import { skyFragmentShader, skyVertexShader } from './skyShader';
import type { SkyStyle } from './types';

/**
 * Material do domo de céu. Os uniforms de estilo são próprios; uSunDir,
 * uTime e uInkColor vêm de `celUniforms` POR REFERÊNCIA (o mesmo objeto
 * { value }), então mudar o sol do pipeline move o sol do céu.
 *
 * Troca de estilo em tempo de execução = só atualizar uniforms. Os defines
 * (USE_STARS / USE_NEBULA / USE_PLANETS) só mudam quando o conjunto de
 * recursos muda, e só aí o shader é recompilado.
 */
export type SkyMaterial = THREE.ShaderMaterial & { userData: { skyFeatures?: string } };

function c(hex = '#000000') {
  return new THREE.Color(hex);
}

export function createSkyUniforms() {
  return {
    uSunDir: celUniforms.uSunDir,
    uTime: celUniforms.uTime,
    uInkColor: celUniforms.uInkColor,
    uPixelAngle: { value: 0.0015 },

    uZenith: { value: c() },
    uUpper: { value: c() },
    uHorizon: { value: c() },
    uGround: { value: c() },
    uBands: { value: 4 },
    uBandCurve: { value: DEFAULT_BAND_CURVE },
    uSunBulge: { value: DEFAULT_SUN_BULGE },

    uSunColor: { value: c() },
    uSunSize: { value: 0.035 },
    uHaloColor: { value: c() },
    uHaloStrength: { value: 0.35 },

    uCloudCoverage: { value: 0 },
    uCloudScale: { value: 1 },
    uCloudSpeed: { value: 0 },
    uCloudLit: { value: c() },
    uCloudShadow: { value: c() },
    uCloudRim: { value: c() },
    uCloudAlt: { value: new THREE.Vector2(0, 1) },
    uCloudSharp: { value: 1 },
    uCloudShadowSize: { value: 0.5 },

    uStarDensity: { value: 0 },
    uStarBrightness: { value: 1 },

    uNebulaA: { value: c() },
    uNebulaB: { value: c() },
    uNebulaIntensity: { value: 0 },

    uPlanetDir: { value: [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0)] },
    uPlanetSize: { value: [0, 0] },
    uPlanetColor: { value: [c(), c()] },
    uPlanetShadow: { value: [c(), c()] },
    uPlanetRing: { value: [0, 0] },
    uPlanetRingColor: { value: [c(), c()] },
  };
}

export type SkyUniforms = ReturnType<typeof createSkyUniforms>;

export function createSkyMaterial(style?: SkyStyle): SkyMaterial {
  const material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: createSkyUniforms(),
    vertexShader: skyVertexShader,
    fragmentShader: skyFragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: false,
    transparent: false,
  }) as SkyMaterial;
  if (style) applySkyStyle(material, style);
  return material;
}

/** Copia um SkyStyle para os uniforms. Recompila só se os recursos mudarem. */
export function applySkyStyle(material: THREE.ShaderMaterial, style: SkyStyle): void {
  const u = material.uniforms as SkyUniforms;
  u.uZenith.value.set(style.zenith);
  u.uUpper.value.set(style.upper);
  u.uHorizon.value.set(style.horizon);
  u.uGround.value.set(style.ground);
  u.uBands.value = clampBands(style.bands);
  u.uBandCurve.value = style.bandCurve ?? DEFAULT_BAND_CURVE;
  u.uSunBulge.value = style.sunBulge ?? DEFAULT_SUN_BULGE;

  u.uSunColor.value.set(style.sunColor);
  u.uSunSize.value = style.sunSize;
  u.uHaloColor.value.set(style.haloColor);
  u.uHaloStrength.value = style.haloStrength ?? 0.35;

  const cl = style.cloud;
  u.uCloudCoverage.value = THREE.MathUtils.clamp(cl.coverage, 0, 1);
  u.uCloudScale.value = cl.scale;
  u.uCloudSpeed.value = cl.speed;
  u.uCloudLit.value.set(cl.litColor);
  u.uCloudShadow.value.set(cl.shadowColor);
  u.uCloudRim.value.set(cl.rimColor);
  u.uCloudAlt.value.set(cl.altitude[0], cl.altitude[1]);
  u.uCloudSharp.value = THREE.MathUtils.clamp(cl.sharpness, 0, 1);
  u.uCloudShadowSize.value = THREE.MathUtils.clamp(cl.shadowSize ?? 0.5, 0, 1);

  if (style.stars) {
    u.uStarDensity.value = THREE.MathUtils.clamp(style.stars.density, 0, 1);
    u.uStarBrightness.value = style.stars.brightness;
  }
  if (style.nebula) {
    u.uNebulaA.value.set(style.nebula.colorA);
    u.uNebulaB.value.set(style.nebula.colorB);
    u.uNebulaIntensity.value = THREE.MathUtils.clamp(style.nebula.intensity, 0, 1);
  }
  const planets = style.planets ?? [];
  for (let i = 0; i < 2; i += 1) {
    const p = planets[i];
    if (!p) {
      u.uPlanetSize.value[i] = 0;
      continue;
    }
    u.uPlanetDir.value[i].set(p.dir[0], p.dir[1], p.dir[2]).normalize();
    u.uPlanetSize.value[i] = p.size;
    u.uPlanetColor.value[i].set(p.color);
    u.uPlanetShadow.value[i].set(p.shadowColor);
    u.uPlanetRing.value[i] = p.ring ? 1 : 0;
    if (p.ringColor) u.uPlanetRingColor.value[i].set(p.ringColor);
    else u.uPlanetRingColor.value[i].set(p.color).lerp(new THREE.Color('#ffffff'), 0.45);
  }

  // defines só para ligar/desligar recursos (evita custo quando não usados)
  const defines: Record<string, string> = {};
  if (style.stars && style.stars.density > 0) defines.USE_STARS = '';
  if (style.nebula && style.nebula.intensity > 0) defines.USE_NEBULA = '';
  if (planets.length > 0) defines.USE_PLANETS = '';
  const key = Object.keys(defines).sort().join('|');
  const md = material as SkyMaterial;
  if (md.userData.skyFeatures !== key) {
    md.userData.skyFeatures = key;
    material.defines = defines;
    material.needsUpdate = true;
  }
}

/**
 * Ângulo (rad) coberto por 1 pixel do drawing buffer no centro da tela.
 * Usado no shader para bordas de 1 px estáveis (sol, estrelas, planetas).
 */
export function pixelAngle(fovDeg: number, bufferHeightPx: number): number {
  const h = Math.max(1, bufferHeightPx);
  return (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) * 0.5)) / h;
}
