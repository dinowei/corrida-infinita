import * as THREE from 'three';
import { clamp, ROAD_WIDTH } from './game';

export const TRACK_Z_POSITION = -85;
export const TRACK_LENGTH = 220;
export const SHOULDER_WIDTH = 1.8;
export const SHOULDER_OFFSET = ROAD_WIDTH / 2 + 0.9;

function createAsphaltTexture(kind: 'normal' | 'roughness') {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');

  if (!context) {
    return new THREE.Texture();
  }

  const image = context.createImageData(size, size);
  const data = image.data;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const grain = (Math.sin(x * 0.19) + Math.cos(y * 0.23)) * 0.5;
      const pores = (Math.sin((x + y) * 0.11) + Math.cos((x - y) * 0.07)) * 0.5;
      const crack = Math.sin(x * 0.035) * Math.cos(y * 0.18);

      if (kind === 'normal') {
        const nx = 128 + Math.round((grain * 0.55 + crack * 0.45) * 24);
        const ny = 128 + Math.round((pores * 0.65 - crack * 0.35) * 24);
        data[index] = nx;
        data[index + 1] = ny;
        data[index + 2] = 255;
        data[index + 3] = 255;
      } else {
        const roughness = clamp(
          176 + Math.round(grain * 24 + pores * 28 + crack * 18),
          110,
          236,
        );
        data[index] = roughness;
        data[index + 1] = roughness;
        data[index + 2] = roughness;
        data[index + 3] = 255;
      }
    }
  }

  context.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(12, 160);
  texture.anisotropy = 8;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function createAsphaltMaps() {
  return {
    normalMap: createAsphaltTexture('normal'),
    roughnessMap: createAsphaltTexture('roughness'),
  };
}

export function createBakedShadowTexture() {
  const width = 512;
  const height = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');

  if (!context) {
    return new THREE.Texture();
  }

  context.clearRect(0, 0, width, height);

  const roadGradient = context.createLinearGradient(0, 0, 0, height);
  roadGradient.addColorStop(0, 'rgba(0,0,0,0.12)');
  roadGradient.addColorStop(0.5, 'rgba(0,0,0,0.05)');
  roadGradient.addColorStop(1, 'rgba(0,0,0,0.12)');
  context.fillStyle = roadGradient;
  context.fillRect(0, 0, width, height);

  for (let i = 0; i < 22; i += 1) {
    const y = (i / 22) * height;
    const shadow = context.createRadialGradient(width / 2, y, 10, width / 2, y, width * 0.36);
    shadow.addColorStop(0, 'rgba(0, 0, 0, 0.08)');
    shadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    context.fillStyle = shadow;
    context.fillRect(0, y - width * 0.18, width, width * 0.36);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
