/**
 * Bancada de teste visual do céu (só dev, fora do jogo): renderiza cada preset
 * sem React. Abrir com o servidor do Vite em /src/rendering/sky/__dev__/skyPreview.html
 * Parâmetros: ?p=<preset>&yaw=<graus>&pitch=<graus>&t=<segundos>
 */
import * as THREE from 'three';
import { celUniforms } from '../../cel/uniforms';
import { createSkyMaterial, applySkyStyle, pixelAngle } from '../skyMaterial';
import { SKY_PRESETS, SKY_PRESET_IDS } from '../presets';
import { flareVertexShader, flareFragmentShader } from '../flareShader';
import { computeFlareState, FLARE_ELEMENTS } from '../flare';

const errors: string[] = [];
const W = 640, H = 360;
const params = new URLSearchParams(location.search);
const yaw = parseFloat(params.get('yaw') ?? '0');
const pitch = parseFloat(params.get('pitch') ?? '8');
const t = parseFloat(params.get('t') ?? '10');
const only = params.get('p');
const ids = only ? [only] : SKY_PRESET_IDS;
const scale = only ? 2 : 1;
const sunDirs: Record<string, [number, number, number]> = {
  'clear-day': [0.3, 0.45, -0.85], sunset: [0.25, 0.08, -0.96], 'rain-light': [0.3, 0.3, -0.9],
  'rain-heavy': [0.3, 0.3, -0.9], fog: [0.2, 0.25, -0.95], storm: [0.3, 0.4, -0.9], snow: [0.3, 0.3, -0.9], space: [0.6, 0.25, -0.75],
};
for (const id of ids) {
  const canvas = document.createElement('canvas');
  canvas.width = W * scale; canvas.height = H * scale;
  canvas.title = id;
  document.body.appendChild(canvas);
  const r = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
  r.debug.onShaderError = (gl, prog, vs, fs) => { errors.push(id + ': ' + gl.getShaderInfoLog(vs) + gl.getShaderInfoLog(fs) + gl.getProgramInfoLog(prog)); };
  const scene = new THREE.Scene();
  const style = SKY_PRESETS[id as keyof typeof SKY_PRESETS];
  const mat = createSkyMaterial(style);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 64, 32), mat);
  sky.frustumCulled = false; sky.renderOrder = -1;
  scene.add(sky);
  // chão de teste
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#3a3346' }));
  ground.position.y = 0;
  scene.add(ground);
  const cam = new THREE.PerspectiveCamera(62, W / H, 0.1, 600);
  cam.position.set(0, 2, 0);
  cam.rotation.order = 'YXZ';
  cam.rotation.set(THREE.MathUtils.degToRad(pitch), THREE.MathUtils.degToRad(yaw), 0);
  cam.updateMatrixWorld();
  sky.position.copy(cam.position);
  celUniforms.uSunDir.value.set(...sunDirs[id]).normalize();
  celUniforms.uTime.value = t;
  mat.uniforms.uPixelAngle.value = pixelAngle(62, H * scale);
  // flare
  if (style.flare) {
    const quad = new THREE.PlaneGeometry(2, 2);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index; g.setAttribute('position', quad.getAttribute('position'));
    const n = FLARE_ELEMENTS.length;
    const tt = new Float32Array(n), sz = new Float32Array(n), sh = new Float32Array(n), co = new Float32Array(n * 3), al = new Float32Array(n);
    const tmp = new THREE.Color();
    FLARE_ELEMENTS.forEach((e, i) => { tt[i] = e.t; sz[i] = e.size; sh[i] = { disc: 0, hex: 1, ring: 2 }[e.shape]; tmp.set(e.color).toArray(co, i * 3); al[i] = e.alpha; });
    g.setAttribute('aT', new THREE.InstancedBufferAttribute(tt, 1));
    g.setAttribute('aSize', new THREE.InstancedBufferAttribute(sz, 1));
    g.setAttribute('aShape', new THREE.InstancedBufferAttribute(sh, 1));
    g.setAttribute('aColor', new THREE.InstancedBufferAttribute(co, 3));
    g.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(al, 1));
    g.instanceCount = n;
    const st = computeFlareState(celUniforms.uSunDir.value, cam);
    const fm = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: flareVertexShader, fragmentShader: flareFragmentShader,
      uniforms: { uSunNdc: { value: st.ndc }, uAspect: { value: W / H }, uTint: { value: new THREE.Color(style.sunColor) }, uFade: { value: st.fade } },
      transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false });
    const fl = new THREE.Mesh(g, fm); fl.frustumCulled = false; fl.renderOrder = 9999;
    scene.add(fl);
  }
  r.render(scene, cam);
  // testa também o caminho MRT
  const rt = new THREE.WebGLRenderTarget(64, 64, { count: 2 });
  r.setRenderTarget(rt); r.render(scene, cam); r.setRenderTarget(null);
  const px = new Float32Array(4); const u8 = new Uint8Array(4);
  r.readRenderTargetPixels(rt, 32, 63, 1, 1, u8, undefined, 1);
  (window as any).mrt = (window as any).mrt || {}; (window as any).mrt[id] = Array.from(u8);
}
(window as any).skyErrors = errors;
document.title = errors.length ? 'ERR' : 'OK';
