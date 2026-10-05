import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { SHOULDER } from '../../game/modes/circuitSession';
import { sampleTrack, createSample, type TrackFrames } from '../../game/tracks';
import type { BiomePalette } from '../../game/contracts';
import { seededRandom } from '../../game/world/generator';
import { GROUND_Y } from '../../game/world/scenery';
import { addOutline, createCelMaterial, Outlined } from '../../rendering/cel';
import {
  createBannerTexture,
  createBarrierTexture,
  createCheckerTexture,
  createChevronTexture,
  createRoadTexture,
} from './textures';

export const BARRIER_HEIGHT = 0.9;
const BARRIER_THICK = 0.45;
const DECK_DEPTH = 1.2;

type RibbonOptions = {
  offA: number;
  liftA: number;
  offB: number;
  liftB: number;
  /** traços: [comprimento ligado, desligado] em metros */
  dash?: [number, number];
  /** incluir o segmento i? */
  filter?: (i: number, s: number) => boolean;
  color?: (i: number, s: number) => THREE.Color;
  vScale?: number;
};

const va = new THREE.Vector3();
const vb = new THREE.Vector3();
const p = new THREE.Vector3();
const r = new THREE.Vector3();
const n = new THREE.Vector3();

function point(track: TrackFrames, i: number, off: number, lift: number, out: THREE.Vector3) {
  p.fromArray(track.position, i * 3);
  r.fromArray(track.right, i * 3);
  n.fromArray(track.up, i * 3);
  return out.copy(p).addScaledVector(r, off).addScaledVector(n, lift);
}

/** Faixa contínua ao longo da pista entre dois perfis laterais (offset, altura). */
function buildRibbon(track: TrackFrames, o: RibbonOptions) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const vScale = o.vScale ?? 1 / 8;

  for (let i = 0; i < track.count; i += 1) {
    const s = i * track.step;
    const j = (i + 1) % track.count;
    if (o.dash) {
      const period = o.dash[0] + o.dash[1];
      if (s % period > o.dash[0]) continue;
    }
    if (o.filter && !o.filter(i, s)) continue;

    const base = positions.length / 3;
    for (const [idx, along] of [
      [i, 0],
      [j, 1],
    ] as const) {
      point(track, idx, o.offA, o.liftA, va);
      point(track, idx, o.offB, o.liftB, vb);
      positions.push(va.x, va.y, va.z, vb.x, vb.y, vb.z);
      const vv = (s + along * track.step) * vScale;
      uvs.push(0, vv, 1, vv);
      if (o.color) {
        const c = o.color(i, s);
        colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
      }
    }
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  if (o.color) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Matriz no frame da pista. Com `facingBack` o objeto é girado 180° em torno
 * da normal (útil para itens do lado esquerdo que devem apontar para a pista).
 */
function basisMatrix(track: TrackFrames, s: number, off: number, lift: number, facingBack = false) {
  const sample = sampleTrack(track, s, createSample());
  const sign = facingBack ? -1 : 1;
  const m = new THREE.Matrix4().makeBasis(
    sample.right.clone().multiplyScalar(sign),
    sample.up,
    sample.tangent.clone().multiplyScalar(-sign),
  );
  const pos = sample.position.clone().addScaledVector(sample.right, off).addScaledVector(sample.up, lift);
  m.setPosition(pos);
  return m;
}

function useTrackGeometry(track: TrackFrames, palette: BiomePalette) {
  return useMemo(() => {
    const half = track.def.width / 2;
    const edge = half + SHOULDER;
    const outer = edge + BARRIER_THICK;
    const white = new THREE.Color(palette.curbB);
    const red = new THREE.Color(palette.curbA);
    const curved = (i: number) => Math.abs(track.curvature[i]) > 1 / 170;

    const geos = {
      road: buildRibbon(track, { offA: -half, liftA: 0, offB: half, liftB: 0, vScale: 1 / 10 }),
      shoulder: new THREE.BufferGeometry(),
      curbs: new THREE.BufferGeometry(),
      yellow: new THREE.BufferGeometry(),
      white: new THREE.BufferGeometry(),
      barrier: new THREE.BufferGeometry(),
      deck: new THREE.BufferGeometry(),
    };

    const merge = (list: THREE.BufferGeometry[]) => {
      const merged = mergeSimple(list);
      list.forEach((g) => g.dispose());
      return merged;
    };

    geos.shoulder = merge([
      buildRibbon(track, { offA: -edge, liftA: 0.005, offB: -half, liftB: 0.005 }),
      buildRibbon(track, { offA: half, liftA: 0.005, offB: edge, liftB: 0.005 }),
    ]);

    const curbColor = (_: number, s: number) => (Math.floor(s / 2.5) % 2 === 0 ? red : white);
    geos.curbs = merge([
      buildRibbon(track, { offA: -half - 1.1, liftA: 0.04, offB: -half, liftB: 0.04, filter: curved, color: curbColor }),
      buildRibbon(track, { offA: half, liftA: 0.04, offB: half + 1.1, liftB: 0.04, filter: curved, color: curbColor }),
    ]);

    geos.yellow = merge([
      buildRibbon(track, { offA: -0.3, liftA: 0.02, offB: -0.14, liftB: 0.02 }),
      buildRibbon(track, { offA: 0.14, liftA: 0.02, offB: 0.3, liftB: 0.02 }),
    ]);

    const lane = half / 2;
    geos.white = merge([
      buildRibbon(track, { offA: -lane - 0.09, liftA: 0.02, offB: -lane + 0.09, liftB: 0.02, dash: [4, 7] }),
      buildRibbon(track, { offA: lane - 0.09, liftA: 0.02, offB: lane + 0.09, liftB: 0.02, dash: [4, 7] }),
      buildRibbon(track, { offA: -half + 0.25, liftA: 0.02, offB: -half + 0.45, liftB: 0.02 }),
      buildRibbon(track, { offA: half - 0.45, liftA: 0.02, offB: half - 0.25, liftB: 0.02 }),
    ]);

    geos.barrier = merge([
      // face interna, topo e face externa (esquerda e direita)
      buildRibbon(track, { offA: -edge, liftA: BARRIER_HEIGHT, offB: -edge, liftB: 0 }),
      buildRibbon(track, { offA: -outer, liftA: BARRIER_HEIGHT, offB: -edge, liftB: BARRIER_HEIGHT }),
      buildRibbon(track, { offA: -outer, liftA: -DECK_DEPTH, offB: -outer, liftB: BARRIER_HEIGHT }),
      buildRibbon(track, { offA: edge, liftA: 0, offB: edge, liftB: BARRIER_HEIGHT }),
      buildRibbon(track, { offA: edge, liftA: BARRIER_HEIGHT, offB: outer, liftB: BARRIER_HEIGHT }),
      buildRibbon(track, { offA: outer, liftA: BARRIER_HEIGHT, offB: outer, liftB: -DECK_DEPTH }),
    ]);

    geos.deck = buildRibbon(track, { offA: outer, liftA: -DECK_DEPTH, offB: -outer, liftB: -DECK_DEPTH });

    return geos;
  }, [palette, track]);
}

/** Junta geometrias com os mesmos atributos (posição, uv, cor opcional). */
function mergeSimple(list: THREE.BufferGeometry[]) {
  const attrNames = ['position', 'uv', 'color'].filter((name) => list.every((g) => g.getAttribute(name)));
  const merged = new THREE.BufferGeometry();
  for (const name of attrNames) {
    const size = list[0].getAttribute(name).itemSize;
    const total = list.reduce((acc, g) => acc + g.getAttribute(name).array.length, 0);
    const array = new Float32Array(total);
    let offset = 0;
    for (const g of list) {
      array.set(g.getAttribute(name).array as Float32Array, offset);
      offset += g.getAttribute(name).array.length;
    }
    merged.setAttribute(name, new THREE.BufferAttribute(array, size));
  }
  const indices: number[] = [];
  let vertexOffset = 0;
  for (const g of list) {
    const idx = g.getIndex();
    if (idx) for (let k = 0; k < idx.count; k += 1) indices.push(idx.getX(k) + vertexOffset);
    vertexOffset += g.getAttribute('position').count;
  }
  merged.setIndex(indices);
  merged.computeVertexNormals();
  return merged;
}

function useInstances(track: TrackFrames) {
  return useMemo(() => {
    const half = track.def.width / 2;
    const barrierTop = half + SHOULDER + BARRIER_THICK / 2;

    // Postes de iluminação alternando os lados.
    const lamps: THREE.Matrix4[] = [];
    const spacing = 42;
    for (let s = 20, k = 0; s < track.length - 10; s += spacing, k += 1) {
      const side = k % 2 === 0 ? -1 : 1;
      lamps.push(basisMatrix(track, s, side * barrierTop, BARRIER_HEIGHT, side < 0));
    }

    // Placas de chevron no lado externo das curvas fechadas.
    const chevrons: THREE.Matrix4[] = [];
    for (let s = 0; s < track.length; s += 13) {
      const i = Math.floor(s / track.step) % track.count;
      const k = track.curvature[i];
      if (Math.abs(k) < 1 / 120) continue;
      const outerSide = k > 0 ? -1 : 1;
      const m = basisMatrix(track, s, outerSide * barrierTop, BARRIER_HEIGHT + 0.75, k < 0);
      chevrons.push(m);
    }

    // Pilares sob os trechos elevados.
    const pillars: THREE.Matrix4[] = [];
    for (let i = 0; i < track.count; i += 28) {
      const y = track.position[i * 3 + 1];
      const height = y - DECK_DEPTH - GROUND_Y;
      if (height < 0.6) continue;
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(track.position[i * 3], GROUND_Y + height / 2, track.position[i * 3 + 2]),
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          Math.atan2(track.tangent[i * 3], track.tangent[i * 3 + 2]),
        ),
        new THREE.Vector3(1, height, 1),
      );
      pillars.push(m);
    }

    return { lamps, chevrons, pillars };
  }, [track]);
}

function Instanced({
  matrices,
  geometry,
  material,
  outline = false,
}: {
  matrices: THREE.Matrix4[];
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** traço de casco invertido (props principais) */
  outline?: boolean;
}) {
  const mesh = useMemo(() => {
    const instanced = new THREE.InstancedMesh(geometry, material, Math.max(1, matrices.length));
    matrices.forEach((m, i) => instanced.setMatrixAt(i, m));
    instanced.count = matrices.length;
    instanced.instanceMatrix.needsUpdate = true;
    instanced.computeBoundingSphere();
    if (outline) addOutline(instanced);
    return instanced;
  }, [geometry, material, matrices, outline]);
  return <primitive object={mesh} />;
}

type CircuitTrackProps = {
  track: TrackFrames;
  palette: BiomePalette;
  ink: string;
  /** 0 = seco, 1 = encharcado */
  wetness?: number;
};

export default function CircuitTrack({ track, palette, ink, wetness = 0 }: CircuitTrackProps) {
  const geos = useTrackGeometry(track, palette);
  const inst = useInstances(track);

  const assets = useMemo(() => {
    const rand = seededRandom(track.def.seed ^ 0x5eed);
    const road = createRoadTexture(palette.road, palette.roadDetail, ink, rand);
    const chevron = createChevronTexture(palette.signBg, palette.signArrow, ink);
    const checker = createCheckerTexture(16, 2);
    const banner = createBannerTexture('CORRIDA INFINITA');
    const barrierMap = createBarrierTexture(ink, palette.accent);
    // Pista molhada: tom mais escuro, reflexo em faixas e brilho duro.
    const wetRoad = new THREE.Color(palette.road).multiplyScalar(1 - wetness * 0.35);
    return {
      textures: [road, chevron, checker, banner, barrierMap],
      pole: new THREE.CylinderGeometry(0.11, 0.16, 8, 6).translate(0, 4, 0),
      arm: new THREE.BoxGeometry(2.2, 0.14, 0.14).translate(-1.05, 8, 0),
      head: new THREE.BoxGeometry(0.9, 0.18, 0.36).translate(-2, 7.9, 0),
      sign: new THREE.PlaneGeometry(1.3, 1.3),
      signPost: new THREE.BoxGeometry(0.1, 0.8, 0.1).translate(0, -0.6, -0.02),
      pillar: new THREE.BoxGeometry(3.2, 1, 2.2),
      gantryPost: new THREE.BoxGeometry(0.7, 7.2, 0.7),
      gantryBeam: new THREE.BoxGeometry(track.def.width + SHOULDER * 2 + 2, 1.6, 0.5),
      mats: {
        road: createCelMaterial({
          color: wetness > 0 ? `#${wetRoad.getHexString()}` : '#ffffff',
          map: road,
          reflect: wetness * 0.45,
          specular: wetness * 0.6,
          shininess: 24,
          edgeMask: 0,
        }),
        // Peças coplanares do chão não recebem traço: o contraste de cor já separa.
        shoulder: createCelMaterial({ color: palette.shoulder, edgeMask: 0 }),
        curbs: createCelMaterial({ color: '#ffffff', vertexColors: true, edgeMask: 0 }),
        yellow: createCelMaterial({ color: palette.lineYellow, unlit: true, edgeMask: 0 }),
        white: createCelMaterial({ color: palette.lineWhite, unlit: true, edgeMask: 0 }),
        barrier: createCelMaterial({ color: palette.barrier, map: barrierMap, side: THREE.DoubleSide }),
        deck: createCelMaterial({ color: palette.deck, side: THREE.DoubleSide }),
        pillar: createCelMaterial({ color: palette.pillar }),
        metal: createCelMaterial({ color: palette.metal, rim: 0.35 }),
        lamp: createCelMaterial({ color: palette.lampGlow, unlit: true }),
        sign: createCelMaterial({ color: '#ffffff', map: chevron, unlit: true, side: THREE.DoubleSide }),
        checker: createCelMaterial({ color: '#ffffff', map: checker, unlit: true, edgeMask: 0 }),
        banner: createCelMaterial({ color: '#ffffff', map: banner, unlit: true }),
        gantry: createCelMaterial({ color: palette.metal, rim: 0.4 }),
      },
    };
  }, [ink, palette, track.def.seed, track.def.width, wetness]);

  const startLine = useMemo(() => basisMatrix(track, 0, 0, 0.03), [track]);
  const gantry = useMemo(() => basisMatrix(track, -6, 0, 0), [track]);
  const half = track.def.width / 2;

  useEffect(
    () => () => {
      Object.values(geos).forEach((g) => g.dispose());
      assets.textures.forEach((t) => t.dispose());
      Object.values(assets.mats).forEach((m) => m.dispose());
    },
    [assets, geos],
  );

  const m = assets.mats;
  return (
    <group>
      <mesh geometry={geos.road} material={m.road} />
      <mesh geometry={geos.shoulder} material={m.shoulder} />
      <mesh geometry={geos.curbs} material={m.curbs} />
      <mesh geometry={geos.yellow} material={m.yellow} />
      <mesh geometry={geos.white} material={m.white} />
      <mesh geometry={geos.barrier} material={m.barrier} />
      <mesh geometry={geos.deck} material={m.deck} />

      <Instanced matrices={inst.pillars} geometry={assets.pillar} material={m.pillar} outline />
      <Instanced matrices={inst.lamps} geometry={assets.pole} material={m.metal} outline />
      <Instanced matrices={inst.lamps} geometry={assets.arm} material={m.metal} outline />
      <Instanced matrices={inst.lamps} geometry={assets.head} material={m.lamp} />
      <Instanced matrices={inst.chevrons} geometry={assets.sign} material={m.sign} />
      <Instanced matrices={inst.chevrons} geometry={assets.signPost} material={m.metal} />

      {/* Linha de chegada e pórtico */}
      <group matrixAutoUpdate={false} matrix={startLine}>
        <mesh rotation-x={-Math.PI / 2} material={m.checker}>
          <planeGeometry args={[track.def.width, 2.4]} />
        </mesh>
      </group>
      <group matrixAutoUpdate={false} matrix={gantry}>
        {[-1, 1].map((side) => (
          <Outlined
            key={side}
            geometry={assets.gantryPost}
            material={m.gantry}
            position={[side * (half + SHOULDER + 0.6), 3.6, 0]}
          />
        ))}
        <Outlined geometry={assets.gantryBeam} material={m.gantry} position={[0, 7.4, 0]} />
        <mesh position={[0, 7.4, 0.27]} material={m.banner}>
          <planeGeometry args={[track.def.width + SHOULDER * 2 + 1.6, 1.4]} />
        </mesh>
      </group>
    </group>
  );
}
