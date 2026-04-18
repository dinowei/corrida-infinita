import { Environment, Html, PerspectiveCamera, Sky } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
  type RefObject,
} from 'react';
import * as THREE from 'three';
import {
  createAsphaltMaps,
  createBakedShadowTexture,
  SHOULDER_OFFSET,
  SHOULDER_WIDTH,
  TRACK_LENGTH,
  TRACK_Z_POSITION,
} from '../lib/asphalt';
import { clamp, PLAYER_LIMIT, ROAD_WIDTH } from '../lib/game';
import type { GamePhase, KeyboardState } from '../types/game';
import Player from './Player';

type GameSceneProps = {
  gamePhase: GamePhase;
  keyboardRef: MutableRefObject<KeyboardState>;
  onSpeedChange: (value: number) => void;
  onDistanceChange: (value: number) => void;
};

type TrafficCarData = {
  id: string;
  lane: number;
  z: number;
  speed: number;
  color: string;
  active: boolean;
};

const LANE_WIDTH = ROAD_WIDTH / 3;
const TRAFFIC_COLORS = ['#f97316', '#38bdf8', '#ef4444', '#84cc16', '#eab308'];

function getLaneX(lane: number) {
  return (lane - 1) * LANE_WIDTH;
}

function getCurveOffset(distance: number) {
  const broadTurn = Math.sin(distance / 140) * 1.05;
  const secondaryTurn = Math.sin(distance / 58) * 0.42;
  return broadTurn + secondaryTurn;
}

function createTrafficCar(index: number): TrafficCarData {
  return {
    id: `traffic-${index}`,
    lane: index % 3,
    z: -40 - index * 24,
    speed: 88 + index * 6,
    color: TRAFFIC_COLORS[index % TRAFFIC_COLORS.length],
    active: index < 3,
  };
}

function getDifficultyFactor(distance: number, speed: number) {
  const distanceFactor = clamp(distance / 1800, 0, 1);
  const speedFactor = clamp(speed / 248, 0, 1);
  return clamp(distanceFactor * 0.72 + speedFactor * 0.28, 0, 1);
}

function getActiveTrafficTarget(difficulty: number) {
  return 3 + Math.floor(difficulty * 5);
}

function chooseTrafficLane(traffic: TrafficCarData[], playerLane: number, spawnZ: number) {
  const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);

  for (const lane of lanes) {
    const laneBusy = traffic.some(
      (car) => car.active && car.lane === lane && Math.abs(car.z - spawnZ) < 20,
    );

    const blocksPlayer = lane === playerLane && spawnZ > -65;

    if (!laneBusy && !blocksPlayer) return lane;
  }

  return lanes[0];
}

function resetTrafficCar(
  trafficCar: TrafficCarData,
  traffic: TrafficCarData[],
  index: number,
  difficulty: number,
  playerLane: number,
) {
  const spacingBase = 34 - difficulty * 12;
  const spawnZ = -110 - index * spacingBase - Math.random() * (30 + difficulty * 35);
  trafficCar.active = true;
  trafficCar.z = spawnZ;
  trafficCar.lane = chooseTrafficLane(traffic, playerLane, spawnZ);
  trafficCar.speed = 74 + difficulty * 42 + Math.random() * (18 + difficulty * 14);
  trafficCar.color = TRAFFIC_COLORS[(index + Math.floor(Math.random() * TRAFFIC_COLORS.length)) % TRAFFIC_COLORS.length];
}

function createLightTexture(kind: 'mist' | 'beam') {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');

  if (!context) {
    return new THREE.Texture();
  }

  context.clearRect(0, 0, size, size);

  if (kind === 'mist') {
    const gradient = context.createRadialGradient(
      size / 2,
      size / 2,
      size * 0.08,
      size / 2,
      size / 2,
      size * 0.48,
    );
    gradient.addColorStop(0, 'rgba(210, 230, 255, 0.6)');
    gradient.addColorStop(0.45, 'rgba(150, 180, 220, 0.18)');
    gradient.addColorStop(1, 'rgba(150, 180, 220, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  } else {
    const gradient = context.createLinearGradient(size / 2, 0, size / 2, size);
    gradient.addColorStop(0, 'rgba(255,255,220,0.92)');
    gradient.addColorStop(0.2, 'rgba(255,244,190,0.32)');
    gradient.addColorStop(1, 'rgba(255,244,190,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function LoadingFallback() {
  return (
    <Html center>
      <div className="loading-card">Carregando Nissan GT-R otimizado...</div>
    </Html>
  );
}

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
          color="#1a2233"
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

function AtmosphericMist({
  speedRef,
}: {
  speedRef: MutableRefObject<number>;
}) {
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
    const speedFactor = clamp(speedRef.current / 248, 0, 1);
    const flow = (speedRef.current / 3.6) * delta * 0.9;

    if (fogLayerRef.current) {
      for (const child of fogLayerRef.current.children) {
        child.lookAt(state.camera.position);
        child.position.z += flow;
        if (child.position.z > 12) child.position.z -= 120;
      }
    }

    if (fogLayerRef.current) {
      fogLayerRef.current.children.forEach((child, index) => {
        const material = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        material.opacity = mistBanks[index].opacity + speedFactor * 0.018;
      });
    }
  });

  return (
    <group ref={fogLayerRef}>
      {mistBanks.map((bank) => (
        <mesh
          key={bank.key}
          position={[bank.x, bank.y, bank.z]}
          scale={[bank.scale * 1.8, bank.scale, 1]}
        >
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
    if (!car) return;

    const speedFactor = clamp(speedRef.current / 248, 0, 1);

    if (beamGroupRef.current) {
      beamGroupRef.current.position.copy(car.position);
      beamGroupRef.current.rotation.copy(car.rotation);

      beamGroupRef.current.children.forEach((child) => {
        const material = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        material.opacity = 0.08 + speedFactor * 0.04;
      });
    }
  });

  return (
    <>
      <group ref={beamGroupRef}>
        <mesh position={[-0.42, 0.22, -2.8]} rotation-x={-Math.PI / 2.45} scale={[1.2, 8.5, 1]}>
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
        <mesh position={[0.42, 0.22, -2.8]} rotation-x={-Math.PI / 2.45} scale={[1.2, 8.5, 1]}>
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
      </group>
    </>
  );
}

function CameraRig({
  targetRef,
  speedRef,
  curveRef,
}: {
  targetRef: RefObject<THREE.Group | null>;
  speedRef: MutableRefObject<number>;
  curveRef: MutableRefObject<number>;
}) {
  const { camera } = useThree();
  const chaseTarget = useMemo(() => new THREE.Vector3(), []);
  const lookTarget = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const target = targetRef.current;
    if (!target) return;

    const curveInfluence = curveRef.current * 0.55;

    chaseTarget.set(
      target.position.x * 0.5 + curveInfluence,
      4.2 + speedRef.current / 170,
      9 - speedRef.current / 50,
    );

    camera.position.lerp(chaseTarget, 0.075);
    lookTarget.set(target.position.x * 0.72 + curveInfluence * 1.4, 0.95, -7);
    camera.lookAt(lookTarget);
  });

  return null;
}

function SunsetAtmosphere({
  speedRef,
}: {
  speedRef: MutableRefObject<number>;
}) {
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null);
  const sunPosition = useMemo(() => new THREE.Vector3(0, 1, 0), []);

  useFrame(() => {
    const speedFactor = clamp(speedRef.current / 248, 0, 1);
    const azimuth = 0.16 + speedFactor * 0.06;
    const elevation = 0.085 + speedFactor * 0.045;
    const theta = Math.PI * (elevation - 0.5);
    const phi = 2 * Math.PI * (azimuth - 0.5);

    sunPosition.setFromSphericalCoords(1, phi, theta);

    if (sunLightRef.current) {
      sunLightRef.current.position.set(
        sunPosition.x * 42,
        Math.max(8, sunPosition.y * 42),
        sunPosition.z * 42,
      );

      const warmColor = new THREE.Color('#ffb36b');
      const brightColor = new THREE.Color('#ffe5b8');
      sunLightRef.current.color.copy(warmColor.lerp(brightColor, speedFactor * 0.45));
      sunLightRef.current.intensity = 1.9 + speedFactor * 0.55;
    }
  });

  return (
    <>
      <Sky
        distance={450000}
        sunPosition={sunPosition}
        turbidity={7.2}
        rayleigh={2}
        mieCoefficient={0.012}
        mieDirectionalG={0.88}
      />
      <directionalLight
        ref={sunLightRef}
        intensity={1.75}
        color="#ffcf9b"
        position={[18, 16, -12]}
      />
    </>
  );
}

function SceneContents({
  gamePhase,
  keyboardRef,
  onSpeedChange,
  onDistanceChange,
}: GameSceneProps) {
  const playerCarRef = useRef<THREE.Group | null>(null);
  const speedRef = useRef(0);
  const distanceRef = useRef(0);
  const lastSpeedValueRef = useRef(0);
  const lastUiSpeedRef = useRef(-1);
  const lastUiDistanceRef = useRef(-1);
  const curveRef = useRef(0);
  const laneStripeGroupRef = useRef<THREE.Group | null>(null);
  const postGroupRef = useRef<THREE.Group | null>(null);
  const trafficGroupRef = useRef<THREE.Group | null>(null);
  const trafficStateRef = useRef<TrafficCarData[]>(
    Array.from({ length: 6 }, (_, index) => createTrafficCar(index)),
  );
  const collisionCooldownRef = useRef(0);

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

  useFrame((_, delta) => {
    const car = playerCarRef.current;
    if (!car) return;

    const isRunning = gamePhase === 'running';
    const keys = keyboardRef.current;
    const frameDelta = Math.min(delta, 0.033);
    const accelForce = keys.accelerate ? 54 : 17;
    const brakeForce = keys.brake ? 72 : 0;
    const steeringInput = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    const playerLane = clamp(Math.round(car.position.x / LANE_WIDTH) + 1, 0, 2);

    if (isRunning) {
      speedRef.current += accelForce * frameDelta;
      speedRef.current -= brakeForce * frameDelta;
      speedRef.current -= 10.5 * frameDelta;
      speedRef.current = clamp(speedRef.current, 0, 248);
      distanceRef.current += (speedRef.current / 3.6) * frameDelta;
      curveRef.current = THREE.MathUtils.lerp(
        curveRef.current,
        getCurveOffset(distanceRef.current) * 0.75,
        0.045,
      );
      car.position.x = clamp(
        car.position.x +
          steeringInput * frameDelta * (2.35 + speedRef.current / 58) -
          curveRef.current * frameDelta * (0.42 + speedRef.current / 420),
        -PLAYER_LIMIT,
        PLAYER_LIMIT,
      );
    } else {
      speedRef.current = THREE.MathUtils.lerp(speedRef.current, 0, 0.08);
      curveRef.current = THREE.MathUtils.lerp(curveRef.current, 0, 0.08);
    }

    const difficulty = getDifficultyFactor(distanceRef.current, speedRef.current);
    const targetTrafficCount = getActiveTrafficTarget(difficulty);

    trafficStateRef.current.forEach((trafficCar, index) => {
      if (!trafficCar.active && index < targetTrafficCount) {
        resetTrafficCar(trafficCar, trafficStateRef.current, index, difficulty, playerLane);
      } else if (trafficCar.active && index >= targetTrafficCount) {
        trafficCar.active = false;
      }
    });

    const accelerationDelta =
      (speedRef.current - lastSpeedValueRef.current) / Math.max(frameDelta, 0.0001);
    lastSpeedValueRef.current = speedRef.current;

    const bodyRoll = steeringInput * (0.04 + speedRef.current / 6200);
    const accelerationPitch = clamp(accelerationDelta / 900, -0.065, 0.06);
    const brakingDive = keys.brake ? 0.035 : 0;
    const speedLoad = (speedRef.current / 248) * 0.012;
    const pitch = clamp(speedLoad - accelerationPitch - brakingDive, -0.085, 0.06);

    car.rotation.z = THREE.MathUtils.lerp(
      car.rotation.z,
      -bodyRoll * 8 - curveRef.current * 0.075,
      0.12,
    );
    car.rotation.x = THREE.MathUtils.lerp(car.rotation.x, pitch, 0.08);
    car.rotation.y = THREE.MathUtils.lerp(car.rotation.y, curveRef.current * 0.045, 0.08);
    car.position.y = THREE.MathUtils.lerp(
      car.position.y,
      0.02 + Math.max(0, accelerationPitch) * 0.22 - Math.max(0, -accelerationPitch) * 0.06,
      0.1,
    );

    const roadFlow = (speedRef.current / 3.6) * frameDelta;

    if (laneStripeGroupRef.current) {
      for (const child of laneStripeGroupRef.current.children) {
        const curveAtMarker = getCurveOffset(distanceRef.current - child.position.z * 3.8) * 0.72;
        const laneSign = Math.sign(child.position.x || 1);
        child.position.x = laneSign * (ROAD_WIDTH / 6) + curveAtMarker;
        child.position.z += roadFlow * 1.6;
        if (child.position.z > 12) child.position.z -= 112;
      }
    }

    if (postGroupRef.current) {
      for (const child of postGroupRef.current.children) {
        const isLeft = child.position.x < 0;
        const curveAtPost = getCurveOffset(distanceRef.current - child.position.z * 3.4) * 0.95;
        child.position.x = (isLeft ? -4.4 : 4.4) + curveAtPost;
        child.position.z += roadFlow * 1.2;
        if (child.position.z > 10) child.position.z -= 200;
      }
    }

    if (trafficGroupRef.current) {
      trafficGroupRef.current.children.forEach((child, index) => {
        const traffic = trafficStateRef.current[index];
        child.visible = traffic.active;
        if (!traffic.active) return;

        const relativeFlow = ((speedRef.current - traffic.speed) / 3.6) * frameDelta;
        traffic.z += relativeFlow * 1.05;

        if (traffic.z > 16) {
          resetTrafficCar(traffic, trafficStateRef.current, index, difficulty, playerLane);
        }

        const curveAtTraffic = getCurveOffset(distanceRef.current - traffic.z * 4.2) * 0.72;
        child.position.x = getLaneX(traffic.lane) + curveAtTraffic;
        child.position.z = traffic.z;
        child.rotation.y = curveRef.current * 0.12 + (traffic.lane - 1) * 0.02;

        if (
          Math.abs(child.position.z) < 2.6 &&
          Math.abs(child.position.x - car.position.x) < 1.15 &&
          collisionCooldownRef.current <= 0
        ) {
          speedRef.current = Math.max(38, speedRef.current * 0.62);
          collisionCooldownRef.current = 1.1;
        }
      });
    }

    collisionCooldownRef.current = Math.max(0, collisionCooldownRef.current - frameDelta);

    const roundedSpeed = Math.round(speedRef.current);
    const roundedDistance = Math.round(distanceRef.current);

    if (roundedSpeed !== lastUiSpeedRef.current) {
      lastUiSpeedRef.current = roundedSpeed;
      onSpeedChange(roundedSpeed);
    }

    if (roundedDistance !== lastUiDistanceRef.current) {
      lastUiDistanceRef.current = roundedDistance;
      onDistanceChange(roundedDistance);
    }
  });

  return (
    <>
      <color attach="background" args={['#08111f']} />
      <fog attach="fog" args={['#223246', 32, 108]} />
      <PerspectiveCamera makeDefault position={[0, 4.2, 9]} fov={62} />
      <CameraRig targetRef={playerCarRef} speedRef={speedRef} curveRef={curveRef} />
      <ambientLight intensity={0.4} color="#aebfd4" />
      <hemisphereLight intensity={0.22} color="#ffbc86" groundColor="#142133" />
      <SunsetAtmosphere speedRef={speedRef} />
      <Environment preset="sunset" environmentIntensity={0.34} />
      <AtmosphericMist speedRef={speedRef} />
      <AsphaltSurface />

      <mesh position={[-SHOULDER_OFFSET, -0.02, TRACK_Z_POSITION]}>
        <boxGeometry args={[SHOULDER_WIDTH, 0.08, TRACK_LENGTH]} />
        <meshStandardMaterial color="#0d1626" roughness={1} />
      </mesh>

      <mesh position={[SHOULDER_OFFSET, -0.02, TRACK_Z_POSITION]}>
        <boxGeometry args={[SHOULDER_WIDTH, 0.08, TRACK_LENGTH]} />
        <meshStandardMaterial color="#0d1626" roughness={1} />
      </mesh>

      <group ref={laneStripeGroupRef}>
        {laneMarkers.map((marker) => (
          <mesh key={marker.key} rotation-x={-Math.PI / 2} position={[marker.x, 0.02, marker.z]}>
            <planeGeometry args={[0.18, 4.2]} />
            <meshBasicMaterial color="#dbeafe" transparent opacity={0.92} />
          </mesh>
        ))}
      </group>

      <group ref={postGroupRef}>
        {posts.map((post) => (
          <mesh key={post.key} position={[post.x, 0.7, post.z]}>
            <cylinderGeometry args={[0.05, 0.05, 1.4, 10]} />
            <meshStandardMaterial
              color="#60a5fa"
              emissive="#1d4ed8"
              emissiveIntensity={1.5}
              metalness={0.45}
              roughness={0.28}
            />
          </mesh>
        ))}
      </group>

      <group ref={trafficGroupRef}>
        {trafficStateRef.current.map((traffic, index) => (
          <group key={traffic.id} position={[getLaneX(traffic.lane), 0.02, traffic.z]} visible={traffic.active}>
            <mesh position={[0, 0.42, 0]}>
              <boxGeometry args={[1.08, 0.42, 2.2]} />
              <meshStandardMaterial
                color={traffic.color}
                metalness={0.68}
                roughness={0.3}
                envMapIntensity={1.15}
              />
            </mesh>
            <mesh position={[0, 0.75, -0.08]}>
              <boxGeometry args={[0.78, 0.28, 1]} />
              <meshStandardMaterial color="#d7e6ff" metalness={0.2} roughness={0.08} />
            </mesh>
            <pointLight
              color={index % 2 === 0 ? '#ff5f5f' : '#ff8c5f'}
              intensity={0.28}
              distance={2.2}
              decay={2}
              position={[0, 0.45, 1.05]}
            />
          </group>
        ))}
      </group>

      <Player carRef={playerCarRef} />
      <CarHeadlights carRef={playerCarRef} speedRef={speedRef} />

      <EffectComposer multisampling={0}>
        <Bloom intensity={0.18} luminanceThreshold={0.72} luminanceSmoothing={0.32} mipmapBlur />
        <Vignette eskil={false} offset={0.08} darkness={0.58} />
      </EffectComposer>
    </>
  );
}

export default function GameScene(props: GameSceneProps) {
  return (
    <Canvas
      shadows={false}
      dpr={[1, 1.25]}
      gl={{ antialias: false }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 0.86;
      }}
    >
      <Suspense fallback={<LoadingFallback />}>
        <SceneContents {...props} />
      </Suspense>
    </Canvas>
  );
}
