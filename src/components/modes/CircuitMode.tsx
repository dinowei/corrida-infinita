import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { BIOMES } from '../../data/biomes';
import { RIVALS } from '../../data/rivals';
import { WEATHER } from '../../data/weather';
import { setEngine, sfxCrash, sfxNearMiss, sfxPickup } from '../../game/audio';
import type { RaceEvent } from '../../game/contracts';
import { readControls } from '../../game/input';
import { CircuitSession } from '../../game/modes/circuitSession';
import { QUALITY } from '../../game/quality';
import { getRecord, saveCircuitRun } from '../../game/save';
import { getPhase, useGameStore } from '../../game/store';
import { createSample, getTrack, minimapProjection, sampleTrack, type FrameSample } from '../../game/tracks';
import { VEHICLES } from '../../game/vehicles';
import { raceKey } from '../../game/world/generator';
import type { VehicleId } from '../../types/game';
import { applyCameraOverride, registerPlayer } from '../../dev/cameraRig';
import RainEffect from '../scene/RainEffect';
import CircuitScenery from '../scene/CircuitScenery';
import CircuitTrack from '../scene/CircuitTrack';
import { createFx } from '../vehicles/fx';
import HoverShip from '../vehicles/HoverShip';
import VehicleModel from '../vehicles/VehicleModel';

const basis = new THREE.Matrix4();
const qYaw = new THREE.Quaternion();
const qRoll = new THREE.Quaternion();
const yAxis = new THREE.Vector3(0, 1, 0);
const zAxis = new THREE.Vector3(0, 0, 1);
const negT = new THREE.Vector3();

function placeOnTrack(object: THREE.Object3D, sample: FrameSample, d: number, yaw: number, roll: number) {
  object.position.copy(sample.position).addScaledVector(sample.right, d);
  negT.copy(sample.tangent).negate();
  basis.makeBasis(sample.right, sample.up, negT);
  object.quaternion.setFromRotationMatrix(basis);
  qYaw.setFromAxisAngle(yAxis, yaw);
  qRoll.setFromAxisAngle(zAxis, roll);
  object.quaternion.multiply(qYaw).multiply(qRoll);
}

export function playEvents(events: RaceEvent[]) {
  const store = useGameStore.getState();
  for (const event of events) {
    if (event.type === 'toast') store.showToast(event.text);
    else if (event.name === 'crash') sfxCrash();
    else if (event.name === 'pickup') sfxPickup();
    else sfxNearMiss();
  }
}

/** Render do modo Circuito: toda a regra de corrida está em CircuitSession. */
export default function CircuitMode({ vehicleId }: { vehicleId: VehicleId }) {
  const weatherId = useGameStore((s) => s.weather);
  const qualityLevel = useGameStore((s) => s.quality);
  const track = useMemo(() => getTrack(), []);
  const weather = WEATHER[weatherId];
  const quality = QUALITY[qualityLevel];
  const biome = BIOMES[track.def.defaultBiome];
  const spec = VEHICLES[vehicleId];
  const key = raceKey({
    trackId: track.def.id,
    trackVersion: track.def.version,
    biome: biome.id,
    weather: weather.id,
    seed: track.def.seed,
  });

  const session = useMemo(() => {
    const record = getRecord(key);
    return new CircuitSession({
      track,
      vehicle: spec,
      weather,
      rivals: RIVALS,
      referenceSplits: record.bestSplits,
      referenceLap: record.bestLap,
    });
  }, [key, spec, track, weather]);

  const { camera } = useThree();
  const playerRef = useRef<THREE.Group | null>(null);
  const rivalRefs = useRef<Array<THREE.Group | null>>([]);
  const fxRef = useRef(createFx());
  const sample = useMemo(() => createSample(), []);
  const rivalSample = useMemo(() => createSample(), []);
  const lookTarget = useMemo(() => new THREE.Vector3(), []);
  const camTarget = useMemo(() => new THREE.Vector3(), []);
  const projection = useMemo(() => minimapProjection(track), [track]);
  const timers = useRef({ hud: 0, map: 0, finishDelay: 0, reported: false });

  useEffect(() => {
    const store = useGameStore.getState();
    store.setMinimapPath(projection.path);
    store.patchHud(session.hud());
    if (import.meta.env.DEV) {
      Object.assign(window, { __race: session });
      registerPlayer(playerRef.current);
    }
    return () => setEngine(0, false, false);
  }, [projection.path, session]);

  useFrame((_, rawDelta) => {
    const store = useGameStore.getState();
    store.markSceneReady();
    const phase = getPhase();
    if (phase === 'paused' || phase === 'menu') {
      setEngine(0, false, false);
      return;
    }
    const dt = Math.min(rawDelta, 0.05);
    const racing = phase === 'running' || phase === 'finished';
    const input = readControls();
    session.update(dt, input, racing);
    playEvents(session.drainEvents());

    const pl = session.player;
    const v = pl.speed / 3.6;
    const controlling = racing && !session.finished;

    // Jogador
    sampleTrack(track, pl.p, sample);
    const yaw = THREE.MathUtils.clamp(Math.atan2(pl.latVel, Math.max(v, 6)), -0.45, 0.45);
    const roll = THREE.MathUtils.clamp(-pl.latVel * 0.012, -0.14, 0.14) * (spec.kind === 'hover' ? -1.4 : 1);
    if (playerRef.current) placeOnTrack(playerRef.current, sample, pl.d, -yaw, roll);
    fxRef.current.thrust = controlling ? Math.max(input.throttle, 0.15) : 0.15;
    fxRef.current.nitro = pl.nitroActive;

    // Rivais
    session.rivals.forEach((rv, i) => {
      const obj = rivalRefs.current[i];
      if (!obj) return;
      sampleTrack(track, rv.p, rivalSample);
      placeOnTrack(obj, rivalSample, rv.d, 0, 0);
    });

    // Câmera de perseguição no referencial da pista.
    const carPos = playerRef.current?.position ?? sample.position;
    camTarget
      .copy(carPos)
      .addScaledVector(sample.tangent, -(7.4 + v * 0.018))
      .addScaledVector(sample.up, 2.7 + v * 0.006)
      .addScaledVector(sample.right, -pl.latVel * 0.08);
    const overridden = import.meta.env.DEV && applyCameraOverride(camera);
    if (!overridden) {
      camera.position.lerp(camTarget, 1 - Math.exp(-dt * 9));
      lookTarget.copy(carPos).addScaledVector(sample.tangent, 9).addScaledVector(sample.up, 1.1);
      camera.lookAt(lookTarget);
    }
    if (!overridden && camera instanceof THREE.PerspectiveCamera) {
      const fovTarget = 60 + Math.min(1, pl.speed / 320) * 12 + (pl.nitroActive ? 6 : 0);
      camera.fov = THREE.MathUtils.lerp(camera.fov, fovTarget, 1 - Math.exp(-dt * 4));
      camera.updateProjectionMatrix();
    }

    setEngine(Math.round(pl.speed), pl.nitroActive, phase !== 'countdown');

    // HUD (~16 Hz) e minimapa (10 Hz)
    const t = timers.current;
    t.hud += dt;
    if (t.hud > 0.06) {
      t.hud = 0;
      store.patchHud(session.hud());
    }
    t.map += dt;
    if (t.map > 0.1) {
      t.map = 0;
      const dots = session.rivals.map((rv, i) => {
        const obj = rivalRefs.current[i];
        const pt = projection.project(obj?.position.x ?? 0, obj?.position.z ?? 0);
        return { x: pt.x, z: pt.z, player: false, color: rv.livery.body };
      });
      const pt = projection.project(carPos.x, carPos.z);
      dots.push({ x: pt.x, z: pt.z, player: true, color: spec.colors.glow });
      store.setMinimap(dots);
    }

    // Resultado, com pequena pausa para ver a chegada.
    const result = session.result();
    if (result && !t.reported) {
      t.finishDelay += dt;
      if (t.finishDelay > 2.2) {
        t.reported = true;
        const saved = saveCircuitRun(key, result.totalTime, result.bestLap, result.bestLapSplits);
        store.patchHud(session.hud());
        store.finish({
          mode: 'circuit',
          position: result.position,
          racers: result.racers,
          totalTime: result.totalTime,
          bestLap: result.bestLap,
          recordLap: saved.prev.bestLap,
          recordTotal: saved.prev.bestTotal,
          newLapRecord: saved.newLapRecord,
          newTotalRecord: saved.newTotalRecord,
        });
      }
    }
  });

  return (
    <>
      <CircuitScenery track={track} biome={biome} weather={weather} scenery={quality.scenery} />
      <CircuitTrack track={track} palette={biome.palette} ink={weather.light.ink} wetness={weather.wetness} />
      {weather.rain > 0 ? <RainEffect intensity={weather.rain} maxDrops={quality.rainDrops} /> : null}
      {session.rivals.map((rv, i) => (
        <group
          key={rv.name}
          ref={(node) => {
            rivalRefs.current[i] = node;
          }}
        >
          <HoverShip livery={rv.livery} phase={i * 1.7} />
        </group>
      ))}
      <group ref={playerRef}>
        <VehicleModel spec={spec} fxRef={fxRef} />
      </group>
    </>
  );
}
