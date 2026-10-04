import { useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react';
import { useFrame, type ThreeElements } from '@react-three/fiber';
import * as THREE from 'three';
import type { Livery } from '../../game/contracts';
import type { VehicleFx } from './fx';

/**
 * Nave hover procedural inspirada nos concepts de referência: casco em cunha
 * facetado, cockpit de vidro escuro, dois motores hexagonais com brilho
 * neon e contorno "nanquim" (inverted hull) para o visual de HQ.
 */
export type HoverLivery = Livery;

export const HOVER_HEIGHT = 0.5;

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
  const underglow = new THREE.PlaneGeometry(2.8, 3.8);
  underglow.rotateX(-Math.PI / 2);
  return { hull, deck, canopy, pod, ring, nozzle, glowDisc, flame, wing, wingStripe, fin, stripe, underglow };
}

function getGeometries() {
  if (!sharedGeometries) sharedGeometries = buildGeometries();
  return sharedGeometries;
}

let glowTexture: THREE.Texture | null = null;
function getGlowTexture() {
  if (glowTexture) return glowTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.3)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  glowTexture = new THREE.CanvasTexture(canvas);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  return glowTexture;
}

const inkMaterial = new THREE.MeshBasicMaterial({ color: '#0b0f1a', side: THREE.BackSide });

function Inked({
  geometry,
  material,
  outline = 1.045,
  children,
  ...props
}: {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  outline?: number;
  children?: ReactNode;
} & ThreeElements['group']) {
  return (
    <group {...props}>
      <mesh geometry={geometry} material={material} />
      <mesh geometry={geometry} material={inkMaterial} scale={outline} />
      {children}
    </group>
  );
}

type HoverShipProps = {
  livery: HoverLivery;
  fxRef?: MutableRefObject<VehicleFx>;
  /** fase da oscilação, para que naves diferentes não flutuem em sincronia */
  phase?: number;
};

export default function HoverShip({ livery, fxRef, phase = 0 }: HoverShipProps) {
  const geo = getGeometries();
  const bodyRef = useRef<THREE.Group | null>(null);
  const flamesRef = useRef<THREE.Group | null>(null);

  const materials = useMemo(() => {
    const flat = (color: string, metalness: number, roughness: number) =>
      new THREE.MeshStandardMaterial({ color, metalness, roughness, flatShading: true });
    return {
      body: flat(livery.body, 0.35, 0.42),
      accent: flat(livery.accent, 0.3, 0.5),
      stripe: flat(livery.stripe, 0.2, 0.55),
      dark: flat('#1b2130', 0.6, 0.45),
      glass: new THREE.MeshStandardMaterial({
        color: '#123a7a',
        metalness: 0.4,
        roughness: 0.08,
        emissive: '#0b2a66',
        emissiveIntensity: 0.6,
        flatShading: true,
      }),
      glow: new THREE.MeshBasicMaterial({ color: livery.glow, toneMapped: false }),
      flame: new THREE.MeshBasicMaterial({
        color: livery.glow,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
      underglow: new THREE.MeshBasicMaterial({
        map: getGlowTexture(),
        color: livery.glow,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    };
  }, [livery.accent, livery.body, livery.glow, livery.stripe]);

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
      materials.flame.opacity = nitro ? 0.9 : 0.45 + thrust * 0.2;
    }
  });

  const deckY = 0.5;

  return (
    <group>
      <mesh geometry={geo.underglow} material={materials.underglow} position={[0, 0.03, 0.1]} />
      <group ref={bodyRef} position={[0, HOVER_HEIGHT, 0]}>
        <group position={[0, -0.25, 0]}>
          <Inked geometry={geo.hull} material={materials.body} />
          <mesh geometry={geo.deck} material={materials.accent} position={[0, deckY, 0]} />
          <mesh geometry={geo.stripe} material={materials.stripe} position={[0, deckY + 0.23, 0.05]} />
          <Inked
            geometry={geo.canopy}
            material={materials.glass}
            position={[0, deckY + 0.18, -0.25]}
            scale={[0.36, 0.24, 0.72]}
            outline={1.08}
          />
          {[-1, 1].map((side) => (
            <group key={side} position={[side * 0.98, 0.32, 0.5]}>
              <Inked geometry={geo.pod} material={materials.body} />
              <mesh geometry={geo.ring} material={materials.accent} position={[0, 0, -0.35]} />
              <mesh geometry={geo.ring} material={materials.stripe} position={[0, 0, 0.3]} scale={[0.98, 0.98, 0.5]} />
              <mesh geometry={geo.nozzle} material={materials.dark} position={[0, 0, 0.82]} />
              <mesh geometry={geo.glowDisc} material={materials.glow} position={[0, 0, 0.94]} />
              <Inked
                geometry={geo.wing}
                material={materials.body}
                position={[side * 0.72, -0.08, 0.15]}
                rotation={[0, side * -0.28, side * -0.1]}
              >
                <mesh geometry={geo.wingStripe} material={materials.stripe} position={[side * 0.1, 0.01, 0.18]} />
              </Inked>
            </group>
          ))}
          {[-1, 1].map((side) => (
            <Inked
              key={`fin-${side}`}
              geometry={geo.fin}
              material={materials.accent}
              position={[side * 0.4, deckY + 0.3, 1.0]}
              rotation={[0.25, 0, side * 0.18]}
            />
          ))}
          <group ref={flamesRef}>
            {[-1, 1].map((side) => (
              <mesh
                key={`flame-${side}`}
                geometry={geo.flame}
                material={materials.flame}
                position={[side * 0.98, 0.32, 1.45]}
              />
            ))}
          </group>
        </group>
      </group>
    </group>
  );
}
