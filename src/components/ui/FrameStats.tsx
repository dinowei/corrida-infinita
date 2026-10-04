import { useEffect, useRef } from 'react';
import { useGameStore } from '../../game/store';

/**
 * Medidor de frame time (não só FPS médio): média, p95 e pior quadro numa
 * janela de 2 s. Atualiza o DOM direto para não re-renderizar o React.
 */
export default function FrameStats() {
  const show = useGameStore((s) => s.showStats);
  const quality = useGameStore((s) => s.quality);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!show) return;
    const samples: number[] = [];
    let last = performance.now();
    let lastPaint = last;
    let raf = 0;
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      // Ignora quadros com a aba em segundo plano.
      if (dt < 500) samples.push(dt);
      while (samples.length > 240) samples.shift();
      if (now - lastPaint > 500 && ref.current && samples.length > 10) {
        lastPaint = now;
        const sorted = [...samples].sort((a, b) => a - b);
        const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
        const p95 = sorted[Math.floor(sorted.length * 0.95)];
        const worst = sorted[sorted.length - 1];
        const fps = 1000 / avg;
        ref.current.dataset.state = p95 > 33.4 ? 'bad' : p95 > 22 ? 'warn' : 'ok';
        ref.current.textContent = `${fps.toFixed(0)} FPS · méd ${avg.toFixed(1)} ms · p95 ${p95.toFixed(1)} ms · pior ${worst.toFixed(0)} ms`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [show]);

  if (!show) return null;
  return (
    <div className="frame-stats" title={`Qualidade: ${quality}`}>
      <div ref={ref}>medindo…</div>
    </div>
  );
}
