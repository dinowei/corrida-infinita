import { useEffect, useState } from 'react';
import { useGameStore } from '../../game/store';
import { formatTime } from '../../lib/format';
import Speedometer from './Speedometer';

function Minimap() {
  const path = useGameStore((s) => s.minimapPath);
  const dots = useGameStore((s) => s.minimap);
  if (!path) return null;
  return (
    <svg className="minimap" viewBox="0 0 100 100" aria-hidden>
      <path d={path} className="minimap-road-outline" />
      <path d={path} className="minimap-road" />
      {dots.map((dot, i) => (
        <circle
          key={i}
          cx={dot.x}
          cy={dot.z}
          r={dot.player ? 3.4 : 2.4}
          fill={dot.player ? '#ffffff' : dot.color}
          stroke={dot.player ? dot.color : '#0b0f1a'}
          strokeWidth={dot.player ? 1.6 : 0.8}
        />
      ))}
    </svg>
  );
}

function Toast() {
  const toast = useGameStore((s) => s.toast);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    const id = window.setTimeout(() => setVisible(false), 2200);
    return () => window.clearTimeout(id);
  }, [toast]);
  if (!toast || !visible) return null;
  return (
    <div key={toast.id} className="toast">
      {toast.text}
    </div>
  );
}

const ordinal = (n: number) => `${n}º`;

function CircuitPanel() {
  const hud = useGameStore((s) => s.hud);
  return (
    <div className="race-panel">
      <div className="race-position">
        <span className="pos-big">{ordinal(hud.position)}</span>
        <span className="pos-total">/{hud.racers}</span>
      </div>
      <div className="race-rows">
        <div>
          <span>Volta</span>
          <strong>
            {hud.lap}/{hud.totalLaps}
          </strong>
        </div>
        <div>
          <span>Tempo</span>
          <strong>{formatTime(hud.lapTime)}</strong>
        </div>
        <div>
          <span>Melhor</span>
          <strong>{hud.bestLap === null ? '--:--.--' : formatTime(hud.bestLap)}</strong>
        </div>
        <div>
          <span>Total</span>
          <strong>{formatTime(hud.raceTime)}</strong>
        </div>
      </div>
    </div>
  );
}

function InfinitePanel() {
  const hud = useGameStore((s) => s.hud);
  return (
    <div className="race-panel">
      <div className="race-rows">
        <div>
          <span>Score</span>
          <strong>{hud.score.toLocaleString('pt-BR')}</strong>
        </div>
        <div>
          <span>Distância</span>
          <strong>{hud.distance.toLocaleString('pt-BR')} m</strong>
        </div>
        <div>
          <span>Recorde</span>
          <strong>{hud.best.toLocaleString('pt-BR')}</strong>
        </div>
      </div>
      <div className="hull">
        <span>Integridade</span>
        <div className="hull-track">
          <div
            className={`hull-fill${hud.hull <= 34 ? ' danger' : ''}`}
            style={{ width: `${hud.hull}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export default function HUD() {
  const mode = useGameStore((s) => s.mode);
  const phase = useGameStore((s) => s.phase);
  const countdown = useGameStore((s) => s.countdown);
  const speed = useGameStore((s) => s.hud.speed);
  const nitro = useGameStore((s) => s.hud.nitro);
  const offTrack = useGameStore((s) => s.hud.offTrack);
  const togglePause = useGameStore((s) => s.togglePause);

  if (phase === 'menu') return null;

  return (
    <div className="hud">
      <div className="hud-top-left">{mode === 'circuit' ? <CircuitPanel /> : <InfinitePanel />}</div>
      <div className="hud-top-right">
        {mode === 'circuit' ? <Minimap /> : null}
        <button type="button" className="icon-button" onClick={togglePause} aria-label="Pausar">
          ❚❚
        </button>
      </div>

      {countdown ? (
        <div className="countdown-overlay" aria-live="assertive">
          <div key={countdown} className={`countdown-text ${countdown === 'GO!' ? 'go' : ''}`}>
            {countdown}
          </div>
        </div>
      ) : null}

      {offTrack ? <div className="warning">Fora da pista</div> : null}
      <Toast />
      <Speedometer speed={speed} nitro={nitro} />
    </div>
  );
}
