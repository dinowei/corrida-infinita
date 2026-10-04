import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject, type RefObject } from 'react';
import * as THREE from 'three';
import {
  createAsphaltMaps,
  createBakedShadowTexture,
  SHOULDER_OFFSET,
  SHOULDER_WIDTH,
  TRACK_LENGTH,
  TRACK_Z_POSITION,
} from '../../lib/asphalt';
import { clamp, ROAD_WIDTH } from '../../lib/game';
import { WEATHER } from '../../data/weather';
import { setEngine } from '../../game/audio';
import { getCurveOffset, getLaneX, InfiniteSession } from '../../game/modes/infiniteSession';
import { QUALITY } from '../../game/quality';
import { readControls } from '../../game/input';
import { loadBest, saveInfiniteRun } from '../../game/save';
import { getPhase, useGameStore } from '../../game/store';
import { VEHICLES } from '../../game/vehicles';
import type { VehicleId } from '../../types/game';
import { applyCameraOverride, registerPlayer } from '../../dev/cameraRig';
import type { CelLighting } from '../../game/contracts';
import { celify, celUniforms } from '../../rendering/cel';
import { applyCelLighting } from '../../rendering/environment';
import { SKY_PRESETS, SkyDome, SunFlare } from '../../rendering/sky';
import RainEffect from '../scene/RainEffect';
import { createLightTexture } from '../scene/textures';
import { playEvents } from './CircuitMode';

/** Semente do tráfego: fixa por enquanto; desafios diários poderão variá-la. */
const INFINITE_SEED = 20261004;
import { createFx } from '../vehicles/fx';
import VehicleModel from '../vehicles/VehicleModel';

function AsphaltSurface() {
  const maps = useMemo(() => createAsphaltMaps(), []);
  const bakedShadowMap = useMemo(() => createBakedShadowTexture(), []);

  useEffect(() => {
    return () => {
      maps.normalMap.dispose();
      maps.roughnessMap.dispose();
      bakedShadowMap.dispose();
    };
  }, [bakedShadowMap, maps]);

  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.001, TRACK_Z_POSITION]}>
        <planeGeometry args={[ROAD_WIDTH, TRACK_LENGTH]} />
        <meshStandardMaterial
          color="#43305e"
          metalness={0.18}
          roughness={0.82}
          normalMap={maps.normalMap}
          normalScale={new THREE.Vector2(0.45, 0.45)}
          roughnessMap={maps.roughnessMap}
          envMapIntensity={1.5}
        />
      </mesh>

      <mesh rotation-x={-Math.PI / 2} position={[0, 0.002, TRACK_Z_POSITION]}>
        <planeGeometry args={[ROAD_WIDTH, TRACK_LENGTH]} />
        <meshBasicMaterial map={bakedShadowMap} transparent opacity={0.5} depthWrite={false} />
      </mesh>
    </>
  );
}

function AtmosphericMist({ speedRef }: { speedRef: MutableRefObject<number> }) {
  const mistTexture = useMemo(() => createLightTexture('mist'), []);
  const fogLayerRef = useRef<THREE.Group | null>(null);

  const mistBanks = useMemo(() => {
    return Array.from({ length: 5 }, (_, index) => ({
      key: `mist-${index}`,
      x: index % 2 === 0 ? -2.7 : 2.7,
      y: 0.95 + (index % 3) * 0.12,
      z: -18 - index * 18,
      scale: 5.2 + (index % 3) * 0.9,
      opacity: 0.035 + (index % 2) * 0.015,
    }));
  }, []);

  useEffect(() => {
    return () => {
      mistTexture.dispose();
    };
  }, [mistTexture]);

  useFrame((state, delta) => {
    if (getPhase() === 'paused') return;
    const speedFactor = clamp(speedRef.current / 248, 0, 1);
    const flow = (speedRef.current / 3.6) * delta * 0.9;

    fogLayerRef.current?.children.forEach((child, index) => {
      child.lookAt(state.camera.position);
      child.position.z += flow;
      if (child.position.z > 12) child.position.z -= 120;
      const material = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      material.opacity = mistBanks[index].opacity + speedFactor * 0.018;
    });
  });

  return (
    <group ref={fogLayerRef}>
      {mistBanks.map((bank) => (
        <mesh key={bank.key} position={[bank.x, bank.y, bank.z]} scale={[bank.scale * 1.8, bank.scale, 1]}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            map={mistTexture}
            color="#c9d7ea"
            transparent
            opacity={bank.opacity}
            depthWrite={false}
            blending={THREE.NormalBlending}
          />
        </mesh>
      ))}
    </group>
  );
}

function CarHeadlights({
  carRef,
  speedRef,
}: {
  carRef: RefObject<THREE.Group | null>;
  speedRef: MutableRefObject<number>;
}) {
  const beamTexture = useMemo(() => createLightTexture('beam'), []);
  const beamGroupRef = useRef<THREE.Group | null>(null);

  useEffect(() => {
    return () => {
      beamTexture.dispose();
    };
  }, [beamTexture]);

  useFrame(() => {
    const car = carRef.current;
    if (!car || !beamGroupRef.current) return;
    const speedFactor = clamp(speedRef.current / 248, 0, 1);
    beamGroupRef.current.position.copy(car.position);
    beamGroupRef.current.rotation.copy(car.rotation);
    beamGroupRef.current.children.forEach((child) => {
      const material = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      material.opacity = 0.08 + speedFactor * 0.04;
    });
  });

  return (
    <group ref={beamGroupRef}>
      {[-0.42, 0.42].map((x) => (
        <mesh key={x} position={[x, 0.22, -2.8]} rotation-x={-Math.PI / 2.45} scale={[1.2, 8.5, 1]}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            map={beamTexture}
            color="#fff1c4"
            transparent
            opacity={0.1}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  );
}

function CameraRig({
  targetRef,
  speedRef,
  curveRef,
  nitroRef,
}: {
  targetRef: RefObject<THREE.Group | null>;
  speedRef: MutableRefObject<number>;
  curveRef: MutableRefObject<number>;
  nitroRef: MutableRefObject<boolean>;
}) {
  const { camera } = useThree();
  const chaseTarget = useMemo(() => new THREE.Vector3(), []);
  const lookTarget = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    const target = targetRef.current;
    if (!target || getPhase() === 'paused') return;
    if (import.meta.env.DEV && applyCameraOverride(camera)) return;

    const curveInfluence = curveRef.current * 0.55;
    chaseTarget.set(
      target.position.x * 0.5 + curveInfluence,
      4.2 + speedRef.current / 170,
      9 - speedRef.current / 50,
    );
    camera.position.lerp(chaseTarget, 0.075);
    lookTarget.set(target.position.x * 0.72 + curveInfluence * 1.4, 0.95, -7);
    camera.lookAt(lookTarget);

    if (camera instanceof THREE.PerspectiveCamera) {
      const fovTarget = 62 + clamp(speedRef.current / 320, 0, 1) * 8 + (nitroRef.current ? 6 : 0);
      camera.fov = THREE.MathUtils.lerp(camera.fov, fovTarget, 1 - Math.exp(-delta * 4));
      camera.updateProjectionMatrix();
    }
  });

  return null;
}

/** Luz cel do pôr do sol do modo Infinito (o Circuito usa a do clima). */
const SUNSET_LIGHT: CelLighting = {
  sunDir: [0.37, 0.2, -0.9],
  sun: '#ffd29a',
  shadowTint: '#4a2a73',
  skyAmbient: '#ff9f7a',
  groundAmbient: '#3a2148',
  rim: '#ffd9a0',
  ink: '#140a1f',
  reflectSky: '#ff8fb0',
  reflectHorizon: '#ffd08a',
  reflectGround: '#2a1638',
};

/**
 * Céu cel de pôr do sol: domo em faixas + flare. O sol fica baixo à frente e
 * sobe um pouco com a velocidade (sensação de "perseguir" o pôr do sol).
 */
function SunsetAtmosphere({ speedRef }: { speedRef: MutableRefObject<number> }) {
  useEffect(() => applyCelLighting(SUNSET_LIGHT), []);
  useFrame(() => {
    const speedFactor = clamp(speedRef.current / 248, 0, 1);
    const elevation = THREE.MathUtils.degToRad(9 + speedFactor * 3);
    const azimuth = THREE.MathUtils.degToRad(22 + speedFactor * 6);
    celUniforms.uSunDir.value.set(
      Math.sin(azimuth) * Math.cos(elevation),
      Math.sin(elevation),
      -Math.cos(azimuth) * Math.cos(elevation),
    );
  });
  return (
    <>
      <SkyDome style={SKY_PRESETS.sunset} />
      <SunFlare sunColor={SKY_PRESETS.sunset.sunColor} />
    </>
  );
}

export default function InfiniteMode({ vehicleId }: { vehicleId: VehicleId }) {
  const spec = VEHICLES[vehicleId];
  const weatherId = useGameStore((s) => s.weather);
  const qualityLevel = useGameStore((s) => s.quality);
  const weather = WEATHER[weatherId];
  const quality = QUALITY[qualityLevel];
  const session = useMemo(
    () => new InfiniteSession({ vehicle: spec, weather, seed: INFINITE_SEED }),
    [spec, weather],
  );

  const playerCarRef = useRef<THREE.Group | null>(null);
  const fxRef = useRef(createFx());
  // Espelhos da sessão para os componentes visuais (névoa, faróis, câmera).
  const speedRef = useRef(0);
  const curveRef = useRef(0);
  const nitroActiveRef = useRef(false);
  const laneStripeGroupRef = useRef<THREE.Group | null>(null);
  const postGroupRef = useRef<THREE.Group | null>(null);
  const trafficGroupRef = useRef<THREE.Group | null>(null);
  const worldRef = useRef<THREE.Group | null>(null);

  // Converte a estrada e o tráfego (materiais nativos) para cel com contorno.
  useLayoutEffect(() => {
    if (worldRef.current) celify(worldRef.current, { outline: true, rim: 0.5 });
  }, []);
  const bestRef = useRef(loadBest());
  const endRef = useRef({ delay: 0, reported: false });

  const laneMarkers = useMemo(() => {
    const markers: Array<{ key: string; x: number; z: number }> = [];
    for (let lane = -1; lane <= 1; lane += 2) {
      for (let i = 0; i < 14; i += 1) {
        markers.push({ key: `${lane}-${i}`, x: lane * (ROAD_WIDTH / 6), z: -i * 8 });
      }
    }
    return markers;
  }, []);

  const posts = useMemo(() => {
    const items: Array<{ key: string; x: number; z: number }> = [];
    for (let i = 0; i < 20; i += 1) {
      items.push({ key: `l-${i}`, x: -ROAD_WIDTH / 2 - 1.4, z: -i * 10 });
      items.push({ key: `r-${i}`, x: ROAD_WIDTH / 2 + 1.4, z: -i * 10 });
    }
    return items;
  }, []);

  useEffect(() => {
    if (import.meta.env.DEV) {
      Object.assign(window, { __race: session });
      registerPlayer(playerCarRef.current);
    }
    return () => setEngine(0, false, false);
  }, [session]);

  useFrame((_, delta) => {
    const car = playerCarRef.current;
    if (!car) return;
    const store = useGameStore.getState();
    store.markSceneReady();
    const phase = getPhase();
    if (phase === 'paused') {
      setEngine(0, false, false);
      return;
    }

    const dt = Math.min(delta, 0.033);
    const input = readControls();
    const racing = phase === 'running';
    session.update(dt, input, racing);
    playEvents(session.drainEvents());

    const running = racing && !session.finished;
    speedRef.current = session.speed;
    curveRef.current = session.curve;
    nitroActiveRef.current = session.nitroActive;
    fxRef.current.thrust = running ? Math.max(0.2, input.throttle) : 0.15;
    fxRef.current.nitro = session.nitroActive;
    setEngine(Math.round(session.speed), session.nitroActive, running);

    // Carroceria: rolagem na direção, mergulho na frenagem, carga com velocidade.
    const bodyRoll = input.steer * (0.04 + session.speed / 6200);
    const brakingDive = input.brake > 0 ? 0.035 : 0;
    const speedLoad = (session.speed / 248) * 0.012;
    const pitch = clamp(speedLoad - session.accelPitch - brakingDive, -0.085, 0.06);
    const rollSign = spec.kind === 'hover' ? -1.3 : 1;
    const k = (rate: number) => 1 - Math.exp(-rate * dt);
    car.position.x = session.carX;
    car.rotation.z = THREE.MathUtils.lerp(car.rotation.z, (-bodyRoll * 8 - session.curve * 0.075) * rollSign, k(7.7));
    car.rotation.x = THREE.MathUtils.lerp(car.rotation.x, pitch, k(5));
    car.rotation.y = THREE.MathUtils.lerp(car.rotation.y, session.curve * 0.045 - input.steer * 0.06, k(5));
    car.position.y = THREE.MathUtils.lerp(
      car.position.y,
      0.02 + Math.max(0, session.accelPitch) * 0.22 - Math.max(0, -session.accelPitch) * 0.06,
      k(6.3),
    );

    const flow = session.roadFlow;
    const distance = session.distance;
    laneStripeGroupRef.current?.children.forEach((child) => {
      const curveAtMarker = getCurveOffset(distance - child.position.z * 3.8) * 0.72;
      child.position.x = (child.userData.side as number) * (ROAD_WIDTH / 6) + curveAtMarker;
      child.position.z += flow * 1.6;
      if (child.position.z > 12) child.position.z -= 112;
    });
    postGroupRef.current?.children.forEach((child) => {
      const curveAtPost = getCurveOffset(distance - child.position.z * 3.4) * 0.95;
      child.position.x = (child.userData.left ? -4.4 : 4.4) + curveAtPost;
      child.position.z += flow * 1.2;
      if (child.position.z > 10) child.position.z -= 200;
    });
    trafficGroupRef.current?.children.forEach((child, index) => {
      const traffic = session.traffic[index];
      child.visible = traffic.active;
      if (!traffic.active) return;
      child.position.set(session.trafficX(traffic), 0.02, traffic.z);
      child.rotation.y = session.curve * 0.12 + (traffic.lane - 1) * 0.02;
      const body = child.children[0] as THREE.Mesh;
      (body.material as THREE.MeshStandardMaterial).color.set(traffic.color);
    });

    if (session.totalScore > bestRef.current) bestRef.current = session.totalScore;
    store.patchHud({ ...session.hud(), best: bestRef.current });

    const result = session.result();
    const end = endRef.current;
    if (result && !end.reported) {
      end.delay += dt;
      if (end.delay > 1.6) {
        end.reported = true;
        const saved = saveInfiniteRun(result.score, result.distance);
        store.finish({ mode: 'infinite', ...result, best: saved.best, newRecord: saved.newRecord });
      }
    }
  });

  return (
    <>
      <fog attach="fog" args={['#ff9a5c', 60, 220]} />
      <CameraRig targetRef={playerCarRef} speedRef={speedRef} curveRef={curveRef} nitroRef={nitroActiveRef} />
      <SunsetAtmosphere speedRef={speedRef} />
      <group ref={worldRef}>
      <AsphaltSurface />
      {/* Planície escura até o horizonte, para a estrada não flutuar no céu. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.06, -200]}>
        <planeGeometry args={[1200, 900]} />
        <meshStandardMaterial color="#3a1f4f" roughness={1} />
      </mesh>

      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * SHOULDER_OFFSET, -0.02, TRACK_Z_POSITION]}>
          <boxGeometry args={[SHOULDER_WIDTH, 0.08, TRACK_LENGTH]} />
          <meshStandardMaterial color="#5a3a78" roughness={1} />
        </mesh>
      ))}

      <group ref={laneStripeGroupRef}>
        {laneMarkers.map((marker) => (
          <mesh
            key={marker.key}
            rotation-x={-Math.PI / 2}
            position={[marker.x, 0.02, marker.z]}
            userData={{ side: Math.sign(marker.x) }}
          >
            <planeGeometry args={[0.18, 4.2]} />
            <meshBasicMaterial color="#ffe2b0" />
          </mesh>
        ))}
      </group>

      <group ref={postGroupRef}>
        {posts.map((post) => (
          <mesh key={post.key} position={[post.x, 0.7, post.z]} userData={{ left: post.x < 0 }}>
            <cylinderGeometry args={[0.08, 0.08, 1.4, 6]} />
            <meshBasicMaterial color="#5ee7ff" />
          </mesh>
        ))}
      </group>

      <group ref={trafficGroupRef}>
        {session.traffic.map((traffic, index) => (
          <group key={index} position={[getLaneX(traffic.lane), 0.02, traffic.z]} visible={traffic.active}>
            <mesh position={[0, 0.42, 0]}>
              <boxGeometry args={[1.08, 0.42, 2.2]} />
              <meshStandardMaterial color={traffic.color} metalness={0.68} roughness={0.3} envMapIntensity={1.15} />
            </mesh>
            <mesh position={[0, 0.75, -0.08]}>
              <boxGeometry args={[0.78, 0.28, 1]} />
              <meshStandardMaterial color="#d7e6ff" metalness={0.2} roughness={0.08} />
            </mesh>
            <mesh position={[0, 0.45, 1.11]}>
              <boxGeometry args={[0.9, 0.08, 0.02]} />
              <meshBasicMaterial color={index % 2 === 0 ? '#ff3b3b' : '#ff7a3b'} toneMapped={false} />
            </mesh>
          </group>
        ))}
      </group>
      </group>

      <group ref={playerCarRef}>
        <VehicleModel spec={spec} fxRef={fxRef} />
      </group>
      {weather.rain > 0 ? <RainEffect intensity={weather.rain} maxDrops={quality.rainDrops} /> : null}
    </>
  );
}
