// Harness de desenvolvimento (sem R3F): compila todos os shaders e alterna
// os dois caminhos do CelPipeline. ?edges=0 desliga o pós-processo.
import * as THREE from 'three';
import { addOutline, CelMaterial, CelPipeline, celify, computeSmoothNormals, createOutlineMaterial } from '../index';

const params = new URLSearchParams(location.search);
const edges = params.get('edges') !== '0';
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('root')!.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#9ec9ff');
scene.fog = new THREE.Fog('#9ec9ff', 25, 90);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 500);
camera.position.set(0, 3, 8);
const camP = (params.get('cam') ?? '0,3,8').split(',').map(Number);
camera.position.set(camP[0], camP[1], camP[2]);
const lookP = (params.get('look') ?? '0,1,0').split(',').map(Number);
camera.lookAt(lookP[0], lookP[1], lookP[2]);

const outlined = (geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number]) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  addOutline(m);
  scene.add(m);
  return m;
};
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new CelMaterial({ color: '#555a66' })));
const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 200).rotateX(-Math.PI / 2), new CelMaterial({ color: '#ffffff', unlit: true }));
stripe.position.y = 0.01;
scene.add(stripe);
outlined(new THREE.SphereGeometry(1, 48, 24), new CelMaterial({ color: '#e0313a', rim: 0.6, specular: 0.6, reflect: 0.3 }), [-2.5, 1, 0]);
const box = outlined(new THREE.BoxGeometry(1.5, 1, 2.5), new CelMaterial({ color: '#ffd23f', rim: 0.6, flatShading: true }), [0, 0.5, 1]);
box.rotation.y = 0.5;
const tex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255, 40, 40, 40, 255, 40, 40, 40, 255, 255, 255, 255, 255]), 2, 2);
tex.needsUpdate = true;
tex.colorSpace = THREE.SRGBColorSpace;
tex.repeat.set(4, 4);
tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
outlined(new THREE.BoxGeometry(1, 1, 1), new CelMaterial({ color: '#ffffff', map: tex, side: THREE.DoubleSide }), [2.2, 0.5, 2]);
const vc = new THREE.IcosahedronGeometry(0.6, 1);
const cols: number[] = [];
for (let i = 0; i < vc.getAttribute('position').count; i++) cols.push(Math.random(), 0.5, 1);
vc.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
outlined(vc, new CelMaterial({ vertexColors: true }), [-1, 0.6, 3]);
outlined(new THREE.BoxGeometry(1, 2, 0.1), new CelMaterial({ color: '#88ccff', transparent: true, opacity: 0.4 }), [-4, 1, 2]);

const inst = new THREE.InstancedMesh(new THREE.ConeGeometry(0.5, 2, 6), new CelMaterial({ color: '#ffffff' }), 40);
const m4 = new THREE.Matrix4();
for (let i = 0; i < 40; i++) {
  m4.makeTranslation(-8 + (i % 2) * 16, 1, -i * 3);
  inst.setMatrixAt(i, m4);
  inst.setColorAt(i, new THREE.Color().setHSL(0.3 + 0.02 * (i % 5), 0.6, 0.4));
}
addOutline(inst);
scene.add(inst);

const legacy = new THREE.Group();
legacy.add(new THREE.Mesh(new THREE.TorusKnotGeometry(0.6, 0.2, 96, 12), new THREE.MeshStandardMaterial({ color: '#3a7bff', metalness: 0.7, roughness: 0.3 })));
legacy.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshBasicMaterial({ color: '#ff00aa' })));
legacy.children[1].position.set(0, 1.2, 0);
legacy.position.set(3, 1.2, -1);
celify(legacy);
scene.add(legacy);
void computeSmoothNormals;
void createOutlineMaterial;

const pipeline = new CelPipeline();
const errors: string[] = [];
const origError = console.error;
console.error = (...a: unknown[]) => {
  errors.push(a.map(String).join(' ').slice(0, 2000));
  origError(...a);
};
let frames = 0;
function frame(t: number) {
  pipeline.render(renderer, scene, camera, { edges, vignette: Number(params.get('vig') ?? 0.25), edgeScale: Number(params.get('scale') ?? 1) }, t / 1000);
  frames++;
  if (frames === 3) {
    const ctx = renderer.getContext();
    const W = ctx.drawingBufferWidth, H = ctx.drawingBufferHeight;
    const pts = [[0.5,0.9],[0.2,0.52],[0.5,0.1],[0.18,0.5],[0.45,0.53],[0.6,0.6],[0.8,0.65],[0.1,0.8],[0.3,0.75]];
    const px = new Uint8Array(4);
    document.body.dataset.px = JSON.stringify(pts.map(([u,v]) => { ctx.readPixels(Math.floor(u*W), Math.floor(v*H), 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px); return Array.from(px.slice(0,3)); }));
  }
  const ctx = renderer.getContext();
  document.body.dataset.dbg = JSON.stringify({
    frames,
    glErr: ctx.getError(),
    programs: renderer.info.programs?.length,
    calls: renderer.info.render.calls,
    errors,
  });
  setTimeout(() => frame(performance.now()), 16);
}
setTimeout(() => frame(performance.now()), 16);
