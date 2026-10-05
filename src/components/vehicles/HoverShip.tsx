import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Livery } from '../../game/contracts';
import { createCelMaterial, Outlined } from '../../rendering/cel';
import { createHullDecalTexture } from '../scene/textures';
import ContactShadow from './ContactShadow';
import type { VehicleFx } from './fx';

/**
 * Nave hover procedural inspirada nos concepts de referência: casco em cunha
 * facetado, cockpit de vidro escuro, dois motores hexagonais com brilho
 * neon e contorno "nanquim" (inverted hull) para o visual de HQ.
 */
export type HoverLivery = Livery;

export const HOVER_HEIGHT = 0.5;
/** traço dos veículos ~1.6× o do cenário: o herói precisa se separar do asfalto escuro */
export const VEHICLE_INK = 1.6;

type Geometries = ReturnType<typeof buildGeometries>;
let sharedGeometries: Geometries | null = null;

function extrudeShape(points: Array<[number, number]>, depth: number, bevel: number) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
  });
  // Shape Y vira -Z (frente), extrusão vira +Y (altura).
  geometry.rotateX(-Math.PI / 2);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  geometry.translate(0, -box.min.y, 0);
  return geometry;
}

function buildGeometries() {
  const hull = extrudeShape(
    [
      [0, 1.75],
      [0.32, 1.55],
      [0.92, 0.1],
      [0.98, -0.95],
      [0.7, -1.32],
      [-0.7, -1.32],
      [-0.98, -0.95],
      [-0.92, 0.1],
      [-0.32, 1.55],
    ],
    0.3,
    0.1,
  );
  const deck = extrudeShape(
    [
      [0, 1.15],
      [0.42, 0.2],
      [0.52, -1.05],
      [-0.52, -1.05],
      [-0.42, 0.2],
    ],
    0.12,
    0.05,
  );
  const canopy = new THREE.SphereGeometry(1, 6, 4);
  const pod = new THREE.CylinderGeometry(0.3, 0.34, 1.5, 6);
  pod.rotateX(Math.PI / 2);
  const ring = new THREE.CylinderGeometry(0.37, 0.37, 0.2, 6);
  ring.rotateX(Math.PI / 2);
  const nozzle = new THREE.CylinderGeometry(0.25, 0.31, 0.22, 6);
  nozzle.rotateX(Math.PI / 2);
  const glowDisc = new THREE.CircleGeometry(0.23, 12);
  const flame = new THREE.ConeGeometry(0.22, 1.1, 10, 1, true);
  flame.translate(0, 0.55, 0);
  flame.rotateX(Math.PI / 2);
  const wing = new THREE.BoxGeometry(0.85, 0.07, 0.72);
  const wingStripe = new THREE.BoxGeometry(0.5, 0.08, 0.12);
  const fin = new THREE.BoxGeometry(0.06, 0.42, 0.5);
  const stripe = new THREE.BoxGeometry(0.14, 0.02, 1.9);
  // Anel neon duro em volta do bocal (no lugar do halo de alfa suave).
  const haloRing = new THREE.RingGeometry(0.26, 0.36, 6);
  return { hull, deck, canopy, pod, ring, nozzle, glowDisc, flame, wing, wingStripe, fin, stripe, haloRing };
}

function getGeometries() {
  if (!sharedGeometries) sharedGeometries = buildGeometries();
  return sharedGeometries;
}

type HoverShipProps = {
  livery: HoverLivery;
  fxRef?: MutableRefObject<VehicleFx>;
  /** fase da oscilação, para que naves diferentes não flutuem em sincronia */
  phase?: number;
  /** número de competição pintado no casco */
  number?: number;
};

export default function HoverShip({ livery, fxRef, phase = 0, number = 7 }: HoverShipProps) {
  const geo = getGeometries();
  const bodyRef = useRef<THREE.Group | null>(null);
  const flamesRef = useRef<THREE.Group | null>(null);

  const materials = useMemo(() => {
    // Pintura: luz em faixas + borda Fresnel dura + especular em faixa.
    const paint = (color: string, specular = 0.45) =>
      createCelMaterial({ color, rim: 0.7, specular, shininess: 40, flatShading: true });
    return {
      // Casco com decalques projetados de cima (UV do topo = plano do casco).
      hull: (() => {
        const decal = createHullDecalTexture(livery.body, livery.stripe, '#0d0b1e', number);
        decal.repeat.set(0.5, 1 / 3.07);
        decal.offset.set(0.5, 1.32 / 3.07);
        return createCelMaterial({ color: '#ffffff', map: decal, rim: 0.7, specular: 0.45, shininess: 40, flatShading: true });
      })(),
      body: paint(livery.body),
      accent: paint(livery.accent),
      stripe: paint(livery.stripe, 0.25),
      dark: createCelMaterial({ color: '#1b1d33', rim: 0.4 }),
      // Vidro: reflexo falso em faixas céu/horizonte/chão, nunca cubemap.
      glass: createCelMaterial({ color: '#1d3f8f', reflect: 0.75, specular: 0.9, shininess: 64, rim: 0.5, flatShading: true }),
      // Motor neon: anel na cor do brilho, núcleo branco-quente e halo aditivo.
      glow: createCelMaterial({ color: livery.glow, unlit: true }),
      core: createCelMaterial({ color: '#ffffff', unlit: true }),
      halo: createCelMaterial({ color: livery.glow, unlit: true, edgeMask: 0 }),
      // Chama cel: cones opacos de borda dura (saturado + núcleo branco), sem alfa suave.
      flame: createCelMaterial({ color: livery.glow, unlit: true, fog: false, edgeMask: 0 }),
      flameCore: createCelMaterial({ color: '#ffffff', unlit: true, fog: false, edgeMask: 0 }),
    };
  }, [livery.accent, livery.body, livery.glow, livery.stripe, number]);

  useEffect(
    () => () => {
      Object.values(materials).forEach((m) => m.dispose());
    },
    [materials],
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime + phase;
    if (bodyRef.current) {
      bodyRef.current.position.y = HOVER_HEIGHT + Math.sin(t * 2.6) * 0.045;
      bodyRef.current.rotation.z = Math.sin(t * 1.7) * 0.012;
    }
    if (flamesRef.current) {
      const thrust = fxRef?.current.thrust ?? 0.5;
      const nitro = fxRef?.current.nitro ?? false;
      const flicker = 0.88 + Math.sin(t * 47) * 0.12;
      const length = (0.3 + thrust * 0.7 + (nitro ? 0.7 : 0)) * flicker;
      flamesRef.current.children.forEach((flame) => flame.scale.set(nitro ? 1.25 : 1, nitro ? 1.25 : 1, length));
    }
  });

  const deckY = 0.5;

  return (
    <group>
      <ContactShadow width={2.3} length={3.6} />
      <group ref={bodyRef} position={[0, HOVER_HEIGHT, 0]}>
        <group position={[0, -0.25, 0]}>
          <Outlined thickness={VEHICLE_INK} geometry={geo.hull} material={materials.hull} />
          <mesh geometry={geo.deck} material={materials.accent} position={[0, deckY, 0]} />
          <mesh geometry={geo.stripe} material={materials.stripe} position={[0, deckY + 0.23, 0.05]} />
          <Outlined
                thickness={VEHICLE_INK}
            geometry={geo.canopy}
            material={materials.glass}
            position={[0, deckY + 0.18, -0.25]}
            scale={[0.36, 0.24, 0.72]}
          />
          {[-1, 1].map((side) => (
            <group key={side} position={[side * 0.98, 0.32, 0.5]}>
              <Outlined thickness={VEHICLE_INK} geometry={geo.pod} material={materials.body} />
              <mesh geometry={geo.ring} material={materials.accent} position={[0, 0, -0.35]} />
              <mesh geometry={geo.ring} material={materials.stripe} position={[0, 0, 0.3]} scale={[0.98, 0.98, 0.5]} />
              <mesh geometry={geo.nozzle} material={materials.dark} position={[0, 0, 0.82]} />
              <mesh geometry={geo.glowDisc} material={materials.glow} position={[0, 0, 0.94]} />
              <mesh geometry={geo.glowDisc} material={materials.core} position={[0, 0, 0.945]} scale={0.5} />
              <mesh geometry={geo.haloRing} material={materials.halo} position={[0, 0, 0.95]} />
              <Outlined
                thickness={VEHICLE_INK}
                geometry={geo.wing}
                material={materials.body}
                position={[side * 0.72, -0.08, 0.15]}
                rotation={[0, side * -0.28, side * -0.1]}
              >
                <mesh geometry={geo.wingStripe} material={materials.stripe} position={[side * 0.1, 0.01, 0.18]} />
              </Outlined>
            </group>
          ))}
          {[-1, 1].map((side) => (
            <Outlined
                thickness={VEHICLE_INK}
              key={`fin-${side}`}
              geometry={geo.fin}
              material={materials.accent}
              position={[side * 0.4, deckY + 0.3, 1.0]}
              rotation={[0.25, 0, side * 0.18]}
            />
          ))}
          <group ref={flamesRef}>
            {[-1, 1].map((side) => (
              <group key={side} position={[side * 0.98, 0.32, 1.45]}>
                <mesh geometry={geo.flame} material={materials.flame} />
                <mesh geometry={geo.flame} material={materials.flameCore} scale={[0.5, 0.5, 0.7]} position={[0, 0, 0.01]} />
              </group>
            ))}
          </group>
        </group>
      </group>
    </group>
  );
}
