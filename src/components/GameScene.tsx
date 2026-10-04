import { Html, PerspectiveCamera } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import { Suspense } from 'react';
import * as THREE from 'three';
import { WEATHER } from '../data/weather';
import { QUALITY } from '../game/quality';
import { useGameStore } from '../game/store';
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
  const weather = WEATHER[useGameStore((s) => s.weather)];
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
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = isCircuit ? weather.exposure : 0.86;
      }}
    >
      <PerspectiveCamera makeDefault position={[0, 4.2, 9]} fov={62} near={0.1} far={isCircuit ? 3000 : 600} />
      <Suspense fallback={<LoadingFallback />}>
        {isCircuit ? <CircuitMode vehicleId={vehicleId} /> : <InfiniteMode vehicleId={vehicleId} />}
      </Suspense>
      {quality.postprocessing ? (
        <EffectComposer multisampling={0}>
          <Bloom intensity={isCircuit ? 0.22 : 0.18} luminanceThreshold={0.78} luminanceSmoothing={0.3} mipmapBlur />
          <Vignette eskil={false} offset={0.1} darkness={isCircuit ? 0.42 : 0.58} />
        </EffectComposer>
      ) : null}
    </Canvas>
  );
}
