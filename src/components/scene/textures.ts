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
 * Asfalto cel: cor chapada, sem ruído de luminância (que a rampa
 * transformaria em manchas). Só três elementos desenhados à mão:
 * - faixas de desgaste dos pneus, um tom mais escuro, ao longo das faixas;
 * - uma junta de dilatação transversal a cada ladrilho (lê velocidade);
 * - pintas finas e esparsas do agregado.
 * U = largura inteira da pista (4 faixas), V = 10 m.
 */
export function createRoadTexture(base: string, detail: string, ink: string, rand: () => number) {
  const w = 512;
  const h = 512;
  const texture = canvasTexture(w, h, (ctx) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    // Desgaste dos pneus: 2 trilhas retas por faixa, borda dura, só nas faixas
    // internas (some perto dos acostamentos, que quase não são usados).
    ctx.fillStyle = detail;
    const lanes = 4;
    for (let lane = 1; lane < lanes - 1; lane += 1) {
      const center = ((lane + 0.5) / lanes) * w;
      for (const offset of [-0.22, 0.22]) ctx.fillRect(Math.round(center + offset * (w / lanes) - 8), 0, 16, h);
    }
    // Junta de dilatação: faixa larga no tom de detalhe (não tinta: um traço
    // fino e escuro isolado era lido como defeito de render).
    ctx.fillStyle = detail;
    ctx.fillRect(0, 0, w, 6);
    // Agregado: poucas pintas, um tom só.
    ctx.fillStyle = detail;
    for (let i = 0; i < 260; i += 1) {
      ctx.fillRect(Math.floor(rand() * w), Math.floor(rand() * h), 2, 2);
    }
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

/** Mureta: faixa de tinta nas bordas, faixa de acento e juntas verticais a cada 4 m. */
export function createBarrierTexture(ink: string, accent: string) {
  const texture = canvasTexture(64, 256, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 64, 256);
    ctx.fillStyle = ink;
    ctx.fillRect(0, 0, 5, 256);
    ctx.fillRect(59, 0, 5, 256);
    // Faixa pintada de acento no meio do perfil (quebra a massa clara da mureta).
    ctx.fillStyle = accent;
    ctx.fillRect(24, 0, 12, 256);
    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.45;
    ctx.fillRect(0, 0, 64, 3);
    ctx.fillRect(0, 128, 64, 3);
    ctx.globalAlpha = 1;
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  return texture;
}

/**
 * Chão: manchas orgânicas grandes em 2–3 tons, borda dura (formadas por
 * círculos sobrepostos, sem degradê). Ladrilha; repete a cada ~200 m.
 */
export function createGroundTexture(base: string, tones: string[], rand: () => number) {
  const size = 512;
  const texture = canvasTexture(size, size, (ctx) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let blob = 0; blob < 22; blob += 1) {
      ctx.fillStyle = tones[blob % tones.length];
      const cx = rand() * size;
      const cy = rand() * size;
      const r = 18 + rand() * 46;
      // Cada mancha = 4–7 círculos; desenhada também nas bordas opostas para ladrilhar sem emenda.
      const parts = 4 + Math.floor(rand() * 4);
      const circles = Array.from({ length: parts }, () => [cx + (rand() - 0.5) * r * 2, cy + (rand() - 0.5) * r, r * (0.5 + rand() * 0.6)]);
      for (const dx of [-size, 0, size]) {
        for (const dy of [-size, 0, size]) {
          ctx.beginPath();
          for (const [x, y, rr] of circles) {
            ctx.moveTo(x + dx + rr, y + dy);
            ctx.arc(x + dx, y + dy, rr, 0, Math.PI * 2);
          }
          ctx.fill();
        }
      }
    }
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

/**
 * Decalques da nave, projetados de cima (UV do casco = plano XZ): linhas de
 * painel em tinta, faixa de corrida, número de competição num círculo e
 * marcas de aviso. `seed` varia o número e o arranjo.
 */
export function createHullDecalTexture(body: string, stripe: string, ink: string, number: number) {
  // A cor do corpo vai na própria textura (o material fica branco), senão a
  // multiplicação tingiria faixa e número com a cor da pintura.
  const texture = canvasTexture(256, 384, (ctx) => {
    ctx.fillStyle = body;
    ctx.fillRect(0, 0, 256, 384);
    // Linhas de painel (o casco vai de y=0 na traseira a y=384 no nariz).
    ctx.strokeStyle = ink;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(40, 300);
    ctx.lineTo(128, 360);
    ctx.lineTo(216, 300);
    ctx.moveTo(30, 150);
    ctx.lineTo(226, 150);
    ctx.moveTo(60, 60);
    ctx.lineTo(60, 150);
    ctx.moveTo(196, 60);
    ctx.lineTo(196, 150);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // Faixa dupla de corrida.
    ctx.fillStyle = stripe;
    ctx.fillRect(98, 0, 22, 384);
    ctx.fillRect(136, 0, 22, 384);
    // Número de competição em estêncil grande, branco com contorno de tinta
    // (sem círculo: círculo + número entre os motores era lido como um rosto).
    ctx.font = 'italic 900 72px Orbitron, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 8;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = ink;
    ctx.strokeText(String(number).padStart(2, '0'), 128, 240);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(number).padStart(2, '0'), 128, 240);
    // Marcas de aviso (chevrons pretos/amarelos) na traseira.
    for (let i = 0; i < 6; i += 1) {
      ctx.fillStyle = i % 2 === 0 ? '#ffd23f' : ink;
      ctx.fillRect(20 + i * 12, 14, 12, 18);
      ctx.fillRect(164 + i * 12, 14, 12, 18);
    }
  });
  // Canvas y=0 = traseira (v=0); sem flip para casar com a UV do casco.
  texture.flipY = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/** Sombra de contato: elipse chapada de borda dura (sem degradê). */
export function createContactShadowTexture() {
  const texture = canvasTexture(128, 128, (ctx) => {
    ctx.clearRect(0, 0, 128, 128);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(64, 64, 60, 60, 0, 0, Math.PI * 2);
    ctx.fill();
  });
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
    // Grade grossa (4 colunas): janelas grandes não viram moiré à distância.
    for (let y = 12; y < 248; y += 24) {
      for (let x = 10; x < 120; x += 30) {
        const pick = rand();
        ctx.fillStyle = windows[Math.floor(pick * windows.length)];
        ctx.fillRect(x, y, 18, 14);
        // reflexo duro: um traço claro no canto da janela
        if (pick > 0.6) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(x + 2, y + 2, 5, 3);
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
