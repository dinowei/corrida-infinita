import * as THREE from 'three';

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function createLightTexture(kind: 'mist' | 'beam') {
  const size = 256;
  return canvasTexture(size, size, (ctx) => {
    if (kind === 'mist') {
      const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.08, size / 2, size / 2, size * 0.48);
      g.addColorStop(0, 'rgba(210, 230, 255, 0.6)');
      g.addColorStop(0.45, 'rgba(150, 180, 220, 0.18)');
      g.addColorStop(1, 'rgba(150, 180, 220, 0)');
      ctx.fillStyle = g;
    } else {
      const g = ctx.createLinearGradient(size / 2, 0, size / 2, size);
      g.addColorStop(0, 'rgba(255,255,220,0.92)');
      g.addColorStop(0.2, 'rgba(255,244,190,0.32)');
      g.addColorStop(1, 'rgba(255,244,190,0)');
      ctx.fillStyle = g;
    }
    ctx.fillRect(0, 0, size, size);
  });
}

/** Placa de curva: fundo escuro com chevron laranja apontando para a direita. */
export function createChevronTexture() {
  return canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = '#1d1f2b';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#f2f2f2';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 122, 122);
    ctx.fillStyle = '#ff5a1f';
    ctx.beginPath();
    ctx.moveTo(30, 18);
    ctx.lineTo(98, 64);
    ctx.lineTo(30, 110);
    ctx.lineTo(30, 84);
    ctx.lineTo(62, 64);
    ctx.lineTo(30, 44);
    ctx.closePath();
    ctx.fill();
  });
}

export function createCheckerTexture(cols = 16, rows = 2) {
  const texture = canvasTexture(cols * 16, rows * 16, (ctx) => {
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#f8fafc' : '#0f172a';
        ctx.fillRect(x * 16, y * 16, 16, 16);
      }
    }
  });
  texture.magFilter = THREE.NearestFilter;
  return texture;
}

export function createBannerTexture(text: string) {
  return canvasTexture(1024, 128, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 1024, 0);
    g.addColorStop(0, '#1e40af');
    g.addColorStop(0.5, '#7c3aed');
    g.addColorStop(1, '#db2777');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1024, 128);
    for (let x = 0; x < 1024; x += 32) {
      ctx.fillStyle = (x / 32) % 2 === 0 ? '#f8fafc' : '#0f172a';
      ctx.fillRect(x, 0, 32, 14);
      ctx.fillStyle = (x / 32) % 2 === 0 ? '#0f172a' : '#f8fafc';
      ctx.fillRect(x, 114, 32, 14);
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 64px Orbitron, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 512, 66);
  });
}

/** Fachada com janelas para os prédios do horizonte. */
export function createWindowTexture() {
  const texture = canvasTexture(128, 256, (ctx) => {
    ctx.fillStyle = '#e9edf3';
    ctx.fillRect(0, 0, 128, 256);
    for (let y = 6; y < 256; y += 12) {
      for (let x = 6; x < 128; x += 14) {
        const lit = Math.random();
        ctx.fillStyle = lit > 0.85 ? '#9fb7d9' : lit > 0.4 ? '#5d7392' : '#3e4f68';
        ctx.fillRect(x, y, 9, 7);
      }
    }
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}
