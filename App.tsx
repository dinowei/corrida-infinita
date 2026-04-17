import { Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  Environment,
  Html,
  PerspectiveCamera,
  useGLTF,
} from '@react-three/drei';
import { Bloom, ChromaticAberration, EffectComposer, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';

type GamePhase = 'idle' | 'countdown' | 'running';

type KeyboardState = {
  left: boolean;
  right: boolean;
  accelerate: boolean;
  brake: boolean;
};

type RacingExperienceProps = {
  gamePhase: GamePhase;
  keyboardRef: MutableRefObject<KeyboardState>;
  onSpeedChange: (value: number) => void;
  onDistanceChange: (value: number) => void;
};

const COUNTDOWN_STEPS = ['3', '2', '1', 'GO!'] as const;
const ROAD_WIDTH = 8;
const PLAYER_LIMIT = ROAD_WIDTH * 0.38;
const MODEL_PATH = '/assets/models/carro.glb';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function LoadingFallback() {
  return (
    <Html center>
      <div className="loading-card">Carregando Nissan GT-R...</div>
    </Html>
  );
}

function GTCar({ carRef }: { carRef: RefObject<THREE.Group | null> }) {
  const gltf = useGLTF(MODEL_PATH);

  const preparedScene = useMemo(() => {
    const model = gltf.scene.clone(true);

    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;

      if (Array.isArray(object.material)) {
        for (const material of object.material) {
          if ('envMapIntensity' in material) {
            material.envMapIntensity = 1.9;
          }
          if ('needsUpdate' in material) {
            material.needsUpdate = true;
          }
        }
      } else if (object.material) {
        if ('envMapIntensity' in object.material) {
          object.material.envMapIntensity = 1.9;
        }
        object.material.needsUpdate = true;
      }
    });

    const initialBox = new THREE.Box3().setFromObject(model);
    const initialSize = new THREE.Vector3();
    initialBox.getSize(initialSize);

    // Many vehicle assets come sideways on the X axis.
    model.rotation.y = initialSize.x > initialSize.z ? -Math.PI / 2 : Math.PI;
    model.updateMatrixWorld(true);

    const alignedBox = new THREE.Box3().setFromObject(model);
    const alignedSize = new THREE.Vector3();
    const alignedCenter = new THREE.Vector3();
    alignedBox.getSize(alignedSize);
    alignedBox.getCenter(alignedCenter);

    model.position.x -= alignedCenter.x;
    model.position.y -= alignedBox.min.y;
    model.position.z -= alignedCenter.z;
    model.updateMatrixWorld(true);

    const finalBox = new THREE.Box3().setFromObject(model);
    const finalSize = new THREE.Vector3();
    finalBox.getSize(finalSize);

    const dominantLength = Math.max(finalSize.x, finalSize.z);
    const scale = dominantLength > 0 ? 3.15 / dominantLength : 1;

    return { model, scale };
  }, [gltf.scene]);

  return (
    <group ref={carRef} scale={preparedScene.scale} position={[0, 0, 0]}>
      <primitive object={preparedScene.model} />
    </group>
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

function RacingExperience({
  gamePhase,
  keyboardRef,
  onSpeedChange,
  onDistanceChange,
}: RacingExperienceProps) {
  const playerCarRef = useRef<THREE.Group | null>(null);
  const speedRef = useRef(0);
  const distanceRef = useRef(0);
  const lastUiSpeedRef = useRef(-1);
  const lastUiDistanceRef = useRef(-1);
  const laneStripeGroupRef = useRef<THREE.Group | null>(null);
  const postGroupRef = useRef<THREE.Group | null>(null);

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

    const bodyRoll = steeringInput * (0.04 + speedRef.current / 6200);
    const pitch = (speedRef.current / 248) * 0.03 - (keys.brake ? 0.02 : 0);

    car.rotation.z = THREE.MathUtils.lerp(car.rotation.z, -bodyRoll * 8, 0.12);
    car.rotation.x = THREE.MathUtils.lerp(car.rotation.x, pitch, 0.08);

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

  const laneMarkers = useMemo(() => {
    const markers: Array<{ key: string; x: number; z: number }> = [];
    for (let lane = -1; lane <= 1; lane += 2) {
      for (let i = 0; i < 14; i += 1) {
        markers.push({
          key: `${lane}-${i}`,
          x: lane * (ROAD_WIDTH / 6),
          z: -i * 8,
        });
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

  return (
    <>
      <color attach="background" args={['#08111f']} />
      <fog attach="fog" args={['#08111f', 18, 72]} />

      <PerspectiveCamera makeDefault position={[0, 4.2, 9]} fov={62} />
      <CameraRig targetRef={playerCarRef} speedRef={speedRef} />

      <ambientLight intensity={1.15} color="#dbeafe" />

      <directionalLight
        castShadow
        intensity={2.35}
        color="#ffffff"
        position={[10, 18, 12]}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.5}
        shadow-camera-far={80}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
        shadow-radius={5}
      />

      <Environment preset="city" />

      <mesh rotation-x={-Math.PI / 2} position={[0, -0.001, -85]} receiveShadow>
        <planeGeometry args={[ROAD_WIDTH, 220]} />
        <meshStandardMaterial color="#172033" metalness={0.22} roughness={0.78} />
      </mesh>

      <mesh position={[-ROAD_WIDTH / 2 - 0.9, -0.02, -85]} receiveShadow>
        <boxGeometry args={[1.8, 0.08, 220]} />
        <meshStandardMaterial color="#0d1626" roughness={1} />
      </mesh>

      <mesh position={[ROAD_WIDTH / 2 + 0.9, -0.02, -85]} receiveShadow>
        <boxGeometry args={[1.8, 0.08, 220]} />
        <meshStandardMaterial color="#0d1626" roughness={1} />
      </mesh>

      <group ref={laneStripeGroupRef}>
        {laneMarkers.map((marker) => (
          <mesh
            key={marker.key}
            rotation-x={-Math.PI / 2}
            position={[marker.x, 0.02, marker.z]}
          >
            <planeGeometry args={[0.18, 4.2]} />
            <meshBasicMaterial color="#dbeafe" transparent opacity={0.92} />
          </mesh>
        ))}
      </group>

      <group ref={postGroupRef}>
        {posts.map((post) => (
          <mesh key={post.key} position={[post.x, 0.7, post.z]} castShadow>
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

      <GTCar carRef={playerCarRef} />

      <EffectComposer multisampling={4}>
        <Bloom
          intensity={0.8}
          luminanceThreshold={0.5}
          luminanceSmoothing={0.24}
          mipmapBlur
        />
        <ChromaticAberration offset={new THREE.Vector2(0.001, 0.0015)} />
        <Vignette eskil={false} offset={0.17} darkness={0.95} />
      </EffectComposer>
    </>
  );
}

useGLTF.preload(MODEL_PATH);

export default function App() {
  const keysRef = useRef<KeyboardState>({
    left: false,
    right: false,
    accelerate: false,
    brake: false,
  });

  const [gamePhase, setGamePhase] = useState<GamePhase>('idle');
  const [isStartScreenVisible, setIsStartScreenVisible] = useState(true);
  const [countdownText, setCountdownText] = useState('');
  const [speed, setSpeed] = useState(0);
  const [distance, setDistance] = useState(0);
  const [tip, setTip] = useState('Use A/D ou setas para mudar de faixa.');

  useEffect(() => {
    const onKeyChange = (pressed: boolean) => (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === 'arrowleft' || key === 'a') keysRef.current.left = pressed;
      if (key === 'arrowright' || key === 'd') keysRef.current.right = pressed;
      if (key === 'arrowup' || key === 'w') keysRef.current.accelerate = pressed;
      if (key === 'arrowdown' || key === 's' || key === ' ') keysRef.current.brake = pressed;
    };

    const handleKeyDown = onKeyChange(true);
    const handleKeyUp = onKeyChange(false);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const startGame = async () => {
    if (gamePhase !== 'idle') return;

    setIsStartScreenVisible(false);
    setTip('Prepare-se para largar...');

    await new Promise((resolve) => window.setTimeout(resolve, 320));

    setGamePhase('countdown');

    for (const step of COUNTDOWN_STEPS) {
      setCountdownText(step);
      await new Promise((resolve) => window.setTimeout(resolve, step === 'GO!' ? 520 : 700));
    }

    setCountdownText('');
    setGamePhase('running');
    setTip('GT-R na pista: acelere, mantenha a linha e sinta os reflexos da cidade.');
  };

  return (
    <div className="app-shell">
      <div className="three-stage">
        <Canvas
          shadows
          dpr={[1, 2]}
          gl={{ antialias: true }}
          onCreated={({ gl }) => {
            gl.outputColorSpace = THREE.SRGBColorSpace;
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.1;
            gl.shadowMap.enabled = true;
            gl.shadowMap.type = THREE.PCFSoftShadowMap;
          }}
        >
          <Suspense fallback={<LoadingFallback />}>
            <RacingExperience
              gamePhase={gamePhase}
              keyboardRef={keysRef}
              onSpeedChange={setSpeed}
              onDistanceChange={setDistance}
            />
          </Suspense>
        </Canvas>
      </div>

      <div className="ui-layer hud-container">
        <header className="top-bar">
          <div className="brand-pill">Corrida Infinita</div>
          <div className="stat-pill">Distancia: {distance} m</div>
        </header>

        {gamePhase !== 'running' && countdownText ? (
          <div className="countdown-overlay" aria-live="assertive">
            <div className={`countdown-text ${countdownText === 'GO!' ? 'go' : ''}`}>
              {countdownText}
            </div>
          </div>
        ) : null}

        <div className="speedometer">
          <div className="speed-label">Velocidade</div>
          <div className="speed-value">{speed}</div>
          <div className="speed-unit">km/h</div>
          <div className="speed-track">
            <div className="speed-fill" style={{ width: `${(speed / 248) * 100}%` }} />
          </div>
        </div>

        <div className="tip-card">{tip}</div>

        <section
          className={`start-screen${isStartScreenVisible ? ' visible' : ' hidden'}`}
          aria-hidden={!isStartScreenVisible}
        >
          <div className="eyebrow">AAA Web Experience</div>
          <h1>Corrida Infinita GT-R</h1>
          <p>
            Migrado para React Three Fiber com environment map, pós-processamento
            e o Nissan GT-R R35 Nismo em GLB na pista.
          </p>
          <button type="button" onClick={startGame}>
            Iniciar corrida
          </button>
        </section>
      </div>
    </div>
  );
}
