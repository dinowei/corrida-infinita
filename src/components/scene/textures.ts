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

/** Placa de curva cel: fundo chapado, chevron e moldura em tinta. Aponta para a direita. */
export function createChevronTexture(bg = '#22213a', arrow = '#ff7a1a', ink = '#0d0b1e') {
  const texture = canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = ink;
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = bg;
    ctx.fillRect(8, 8, 112, 112);
    ctx.fillStyle = arrow;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 6;
    ctx.lineJoin = 'miter';
    ctx.beginPath();
    ctx.moveTo(30, 20);
    ctx.lineTo(98, 64);
    ctx.lineTo(30, 108);
    ctx.lineTo(30, 82);
    ctx.lineTo(60, 64);
    ctx.lineTo(30, 46);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });
  texture.magFilter = THREE.NearestFilter;
  return texture;
}

/**
 * Asfalto cel: cor chapada com pintas, remendos e rachaduras traçadas como
 * nanquim fino. Ladrilha em U (largura da pista) e V (cada 10 m). Semente
 * fixa: a mesma pista sempre tem o mesmo asfalto.
 */
export function createRoadTexture(base: string, detail: string, ink: string, rand: () => number) {
  const size = 512;
  const texture = canvasTexture(size, size, (ctx) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    // Remendos: retângulos levemente mais claros com borda dura.
    ctx.fillStyle = detail;
    for (let i = 0; i < 5; i += 1) {
      const w = 40 + rand() * 90;
      const h = 30 + rand() * 120;
      ctx.fillRect(rand() * (size - w), rand() * (size - h), w, h);
    }
    // Pintas de agregado: pontos duros, 2 tons.
    for (let i = 0; i < 900; i += 1) {
      ctx.fillStyle = rand() > 0.5 ? detail : ink;
      ctx.globalAlpha = rand() > 0.5 ? 0.55 : 0.25;
      const r = 1 + Math.floor(rand() * 2);
      ctx.fillRect(Math.floor(rand() * size), Math.floor(rand() * size), r, r);
    }
    ctx.globalAlpha = 1;
    // Rachaduras: polilinhas finas em tinta, curtas e quebradas.
    ctx.strokeStyle = ink;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 2;
    for (let i = 0; i < 7; i += 1) {
      let x = rand() * size;
      let y = rand() * size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 4; k += 1) {
        x += (rand() - 0.5) * 60;
        y += (rand() - 0.2) * 50;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
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
    // Três blocos chapados (sem gradiente) com cortes diagonais, estilo decalque.
    const blocks = ['#2b4bd8', '#7b3ff2', '#ff3d8b'];
    blocks.forEach((color, i) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(i * 341 - 20, 0);
      ctx.lineTo((i + 1) * 341 + 20, 0);
      ctx.lineTo((i + 1) * 341 - 20, 128);
      ctx.lineTo(i * 341 - 60, 128);
      ctx.closePath();
      ctx.fill();
    });
    for (let x = 0; x < 1024; x += 32) {
      ctx.fillStyle = (x / 32) % 2 === 0 ? '#f8fafc' : '#0f172a';
      ctx.fillRect(x, 0, 32, 14);
      ctx.fillStyle = (x / 32) % 2 === 0 ? '#0f172a' : '#f8fafc';
      ctx.fillRect(x, 114, 32, 14);
    }
    ctx.font = 'italic 900 64px Orbitron, Arial, sans-serif';
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#0d0b1e';
    ctx.lineJoin = 'round';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText(text, 512, 66);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 512, 66);
  });
}

/**
 * Fachada cel: parede branca (tingida pela cor da instância), janelas em
 * grade com 3 tons chapados e uma cornija escura no topo. Determinística.
 */
export function createWindowTexture(windows: string[], ink: string, rand: () => number) {
  const texture = canvasTexture(128, 256, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 128, 256);
    for (let y = 10; y < 250; y += 14) {
      for (let x = 8; x < 124; x += 16) {
        const pick = rand();
        ctx.fillStyle = windows[Math.floor(pick * windows.length)];
        ctx.fillRect(x, y, 10, 8);
        // reflexo duro: um traço claro no canto da janela
        if (pick > 0.6) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(x + 1, y + 1, 3, 2);
        }
      }
    }
    ctx.fillStyle = ink;
    ctx.fillRect(0, 0, 128, 4);
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  return texture;
}
