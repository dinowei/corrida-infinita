import { Environment, Html, PerspectiveCamera, Sky } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, ChromaticAberration, EffectComposer, Vignette } from '@react-three/postprocessing';
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
    return Array.from({ length: 10 }, (_, index) => ({
      key: `mist-${index}`,
      x: index % 2 === 0 ? -2.7 : 2.7,
      y: 0.95 + (index % 3) * 0.12,
      z: -10 - index * 12,
      scale: 6.5 + (index % 4) * 1.1,
      opacity: 0.1 + (index % 3) * 0.025,
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
        material.opacity = mistBanks[index].opacity + speedFactor * 0.06;
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
            color="#d8ebff"
            transparent
            opacity={bank.opacity}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  );
}

function TrackAccentLights({
  speedRef,
}: {
  speedRef: MutableRefObject<number>;
}) {
  const accentRef = useRef<THREE.Group | null>(null);

  const lights = useMemo(() => {
    return Array.from({ length: 16 }, (_, index) => ({
      key: `accent-${index}`,
      x: index % 2 === 0 ? -4.9 : 4.9,
      y: 0.4,
      z: -index * 14,
    }));
  }, []);

  useFrame((_, delta) => {
    const flow = (speedRef.current / 3.6) * delta * 1.05;
    const speedFactor = clamp(speedRef.current / 248, 0, 1);

    if (accentRef.current) {
      accentRef.current.children.forEach((child, index) => {
        child.position.z += flow;
        if (child.position.z > 10) child.position.z -= 224;

        const light = child as THREE.PointLight;
        light.intensity = 0.65 + speedFactor * 0.45 + Math.sin(index + performance.now() * 0.002) * 0.06;
      });
    }
  });

  return (
    <group ref={accentRef}>
      {lights.map((light) => (
        <pointLight
          key={light.key}
          position={[light.x, light.y, light.z]}
          color={light.x < 0 ? '#59c7ff' : '#ff8a6b'}
          intensity={0.8}
          distance={8}
          decay={2}
        />
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
  const leftLightRef = useRef<THREE.SpotLight | null>(null);
  const rightLightRef = useRef<THREE.SpotLight | null>(null);
  const leftTargetRef = useRef<THREE.Object3D | null>(null);
  const rightTargetRef = useRef<THREE.Object3D | null>(null);
  const beamTexture = useMemo(() => createLightTexture('beam'), []);
  const beamGroupRef = useRef<THREE.Group | null>(null);
  const headlightGroupRef = useRef<THREE.Group | null>(null);

  useEffect(() => {
    return () => {
      beamTexture.dispose();
    };
  }, [beamTexture]);

  useFrame(() => {
    const car = carRef.current;
    if (!car) return;

    const speedFactor = clamp(speedRef.current / 248, 0, 1);
    const leftTarget = leftTargetRef.current;
    const rightTarget = rightTargetRef.current;

    if (headlightGroupRef.current) {
      headlightGroupRef.current.position.copy(car.position);
      headlightGroupRef.current.rotation.copy(car.rotation);
    }

    if (leftTarget) {
      leftTarget.position.set(car.position.x - 0.8, car.position.y + 0.2, car.position.z - 14 - speedFactor * 7);
      if (leftLightRef.current) leftLightRef.current.target = leftTarget;
    }

    if (rightTarget) {
      rightTarget.position.set(car.position.x + 0.8, car.position.y + 0.2, car.position.z - 14 - speedFactor * 7);
      if (rightLightRef.current) rightLightRef.current.target = rightTarget;
    }

    if (beamGroupRef.current) {
      beamGroupRef.current.position.copy(car.position);
      beamGroupRef.current.rotation.copy(car.rotation);

      beamGroupRef.current.children.forEach((child) => {
        const material = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        material.opacity = 0.12 + speedFactor * 0.08;
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
            opacity={0.16}
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
            opacity={0.16}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      </group>

      <group ref={headlightGroupRef}>
        <spotLight
          ref={leftLightRef}
          color="#fff0c2"
          intensity={16}
          angle={0.26}
          penumbra={0.65}
          distance={26}
          decay={1.6}
          position={[-0.42, 0.28, -1.55]}
        />
        <spotLight
          ref={rightLightRef}
          color="#fff0c2"
          intensity={16}
          angle={0.26}
          penumbra={0.65}
          distance={26}
          decay={1.6}
          position={[0.42, 0.28, -1.55]}
        />
      </group>

      <object3D ref={leftTargetRef} />
      <object3D ref={rightTargetRef} />
    </>
  );
}

function CameraRig({
  targetRef,
  speedRef,
}: {
  targetRef: RefObject<THREE.Group | null>;
  speedRef: MutableRefObject<number>;
}) {
  const { camera } = useThree();
  const chaseTarget = useMemo(() => new THREE.Vector3(), []);
  const lookTarget = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const target = targetRef.current;
    if (!target) return;

    chaseTarget.set(
      target.position.x * 0.5,
      4.2 + speedRef.current / 170,
      9 - speedRef.current / 50,
    );

    camera.position.lerp(chaseTarget, 0.075);
    lookTarget.set(target.position.x * 0.72, 0.95, -7);
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
        turbidity={8}
        rayleigh={2.6}
        mieCoefficient={0.018}
        mieDirectionalG={0.92}
      />
      <directionalLight
        ref={sunLightRef}
        intensity={2.05}
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
  const laneStripeGroupRef = useRef<THREE.Group | null>(null);
  const postGroupRef = useRef<THREE.Group | null>(null);

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

    if (isRunning) {
      speedRef.current += accelForce * frameDelta;
      speedRef.current -= brakeForce * frameDelta;
      speedRef.current -= 10.5 * frameDelta;
      speedRef.current = clamp(speedRef.current, 0, 248);
      distanceRef.current += (speedRef.current / 3.6) * frameDelta;
      car.position.x = clamp(
        car.position.x + steeringInput * frameDelta * (2.35 + speedRef.current / 58),
        -PLAYER_LIMIT,
        PLAYER_LIMIT,
      );
    } else {
      speedRef.current = THREE.MathUtils.lerp(speedRef.current, 0, 0.08);
    }

    const accelerationDelta =
      (speedRef.current - lastSpeedValueRef.current) / Math.max(frameDelta, 0.0001);
    lastSpeedValueRef.current = speedRef.current;

    const bodyRoll = steeringInput * (0.04 + speedRef.current / 6200);
    const accelerationPitch = clamp(accelerationDelta / 900, -0.065, 0.06);
    const brakingDive = keys.brake ? 0.035 : 0;
    const speedLoad = (speedRef.current / 248) * 0.012;
    const pitch = clamp(speedLoad - accelerationPitch - brakingDive, -0.085, 0.06);

    car.rotation.z = THREE.MathUtils.lerp(car.rotation.z, -bodyRoll * 8, 0.12);
    car.rotation.x = THREE.MathUtils.lerp(car.rotation.x, pitch, 0.08);
    car.position.y = THREE.MathUtils.lerp(
      car.position.y,
      0.02 + Math.max(0, accelerationPitch) * 0.22 - Math.max(0, -accelerationPitch) * 0.06,
      0.1,
    );

    const roadFlow = (speedRef.current / 3.6) * frameDelta;

    if (laneStripeGroupRef.current) {
      for (const child of laneStripeGroupRef.current.children) {
        child.position.z += roadFlow * 1.6;
        if (child.position.z > 12) child.position.z -= 112;
      }
    }

    if (postGroupRef.current) {
      for (const child of postGroupRef.current.children) {
        child.position.z += roadFlow * 1.2;
        if (child.position.z > 10) child.position.z -= 200;
      }
    }

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
      <fog attach="fog" args={['#08111f', 18, 72]} />
      <PerspectiveCamera makeDefault position={[0, 4.2, 9]} fov={62} />
      <CameraRig targetRef={playerCarRef} speedRef={speedRef} />
      <ambientLight intensity={0.85} color="#c6d8ff" />
      <hemisphereLight intensity={0.5} color="#ffc58f" groundColor="#102038" />
      <SunsetAtmosphere speedRef={speedRef} />
      <Environment preset="sunset" />
      <AtmosphericMist speedRef={speedRef} />
      <TrackAccentLights speedRef={speedRef} />
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

      <Player carRef={playerCarRef} />
      <CarHeadlights carRef={playerCarRef} speedRef={speedRef} />

      <EffectComposer multisampling={2}>
        <Bloom intensity={1.05} luminanceThreshold={0.42} luminanceSmoothing={0.24} mipmapBlur />
        <ChromaticAberration offset={new THREE.Vector2(0.001, 0.0015)} />
        <Vignette eskil={false} offset={0.17} darkness={0.95} />
      </EffectComposer>
    </>
  );
}

export default function GameScene(props: GameSceneProps) {
  return (
    <Canvas
      shadows={false}
      dpr={[1, 2]}
      gl={{ antialias: true }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.1;
      }}
    >
      <Suspense fallback={<LoadingFallback />}>
        <SceneContents {...props} />
      </Suspense>
    </Canvas>
  );
}
