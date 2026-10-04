import { Html, PerspectiveCamera } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import * as THREE from 'three';
import { QUALITY } from '../game/quality';
import { useGameStore } from '../game/store';
import { CelRenderer } from '../rendering/cel';
import type { GameMode, VehicleId } from '../types/game';
import CircuitMode from './modes/CircuitMode';
import InfiniteMode from './modes/InfiniteMode';

type GameSceneProps = {
  mode: GameMode;
  vehicleId: VehicleId;
};

function LoadingFallback() {
  return (
    <Html center>
      <div className="loading-card">Carregando pista e veículos...</div>
    </Html>
  );
}

export default function GameScene({ mode, vehicleId }: GameSceneProps) {
  const isCircuit = mode === 'circuit';
  const quality = QUALITY[useGameStore((s) => s.quality)];
  return (
    <Canvas
      shadows={false}
      dpr={quality.dpr}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      onCreated={(state) => {
        const { gl } = state;
        // Gancho de depuração para medir custo de render no console (só em dev).
        if (import.meta.env.DEV) Object.assign(window, { __game: state });
        gl.outputColorSpace = THREE.SRGBColorSpace;
        // Cel: cores da paleta saem exatamente como desenhadas — sem tone mapping.
        gl.toneMapping = THREE.NoToneMapping;
      }}
    >
      <PerspectiveCamera makeDefault position={[0, 4.2, 9]} fov={62} near={0.1} far={isCircuit ? 3000 : 600} />
      <Suspense fallback={<LoadingFallback />}>
        {isCircuit ? <CircuitMode vehicleId={vehicleId} /> : <InfiniteMode vehicleId={vehicleId} />}
      </Suspense>
      <CelRenderer edges={quality.edges} edgeScale={quality.edgeScale} vignette={0.18} />
    </Canvas>
  );
}
