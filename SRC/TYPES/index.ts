import * as THREE from 'three';

export interface CarState {
  position: THREE.Vector3;
  speedKmh: number;
  lateralGrip: number;
  steeringAngle: number;
}

export interface AICar {
  id: string;
  mesh: THREE.Mesh;
  speed: number;
  targetLane: number;
  distance: number;
  reactionTime: number;
}

export interface TrackSegment {
  startZ: number;
  endZ: number;
  curvature: number;
  width: number;
}

export interface InputState {
  throttle: number;
  brake: number;
  steer: number;
}