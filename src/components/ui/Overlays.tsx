import { useEffect, useState, type PointerEvent } from 'react';
import { isMuted, setMuted } from '../../game/audio';
import { touch } from '../../game/input';
import type { QualityLevel } from '../../game/contracts';
import { QUALITY } from '../../game/quality';
import { saveSettings } from '../../game/save';
import { useGameStore } from '../../game/store';
import { formatTime } from '../../lib/format';

export function PauseMenu({ onRestart }: { onRestart: () => void }) {
  const phase = useGameStore((s) => s.phase);
  const togglePause = useGameStore((s) => s.togglePause);
  const backToMenu = useGameStore((s) => s.backToMenu);
  const quality = useGameStore((s) => s.quality);
  const setQuality = useGameStore((s) => s.setQuality);
  const showStats = useGameStore((s) => s.showStats);
  const toggleStats = useGameStore((s) => s.toggleStats);
  const [muted, setMutedState] = useState(isMuted());
  if (phase !== 'paused') return null;

  return (
    <div className="modal-backdrop">
      <section className="modal">
        <h2>Pausado</h2>
        <div className="modal-actions">
          <button type="button" onClick={togglePause}>
            Continuar
          </button>
          <button type="button" className="secondary" onClick={onRestart}>
            Reiniciar
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setMuted(!muted);
              saveSettings({ muted: !muted });
              setMutedState(!muted);
            }}
          >
            Som: {muted ? 'desligado' : 'ligado'}
          </button>
          <button type="button" className="secondary" onClick={toggleStats}>
            Desempenho: {showStats ? 'visível' : 'oculto'}
          </button>
          <button type="button" className="secondary" onClick={backToMenu}>
            Menu principal
          </button>
        </div>
        <div className="chip-row centered">
          {(Object.keys(QUALITY) as QualityLevel[]).map((level) => (
            <button
              key={level}
              type="button"
              className={quality === level ? 'chip selected' : 'chip'}
              onClick={() => setQuality(level)}
            >
              {QUALITY[level].label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

export function ResultsScreen({ onRestart }: { onRestart: () => void }) {
  const result = useGameStore((s) => s.result);
  const phase = useGameStore((s) => s.phase);
  const backToMenu = useGameStore((s) => s.backToMenu);
  if (phase !== 'finished' || !result) return null;

  return (
    <div className="modal-backdrop">
      <section className="modal results">
        {result.mode === 'circuit' ? (
          <>
            <div className="eyebrow">Corrida encerrada</div>
            <h2 className={result.position === 1 ? 'win' : ''}>
              {result.position}º lugar <small>de {result.racers}</small>
            </h2>
            <dl>
              <div>
                <dt>Tempo total</dt>
                <dd>
                  {formatTime(result.totalTime)}
                  {result.newTotalRecord ? <b> recorde!</b> : null}
                </dd>
              </div>
              <div>
                <dt>Melhor volta</dt>
                <dd>
                  {formatTime(result.bestLap)}
                  {result.newLapRecord ? <b> recorde!</b> : null}
                </dd>
              </div>
              {result.recordTotal !== null ? (
                <div>
                  <dt>Recorde anterior</dt>
                  <dd>{formatTime(result.recordTotal)}</dd>
                </div>
              ) : null}
            </dl>
          </>
        ) : (
          <>
            <div className="eyebrow">Fim de jogo</div>
            <h2>{result.score.toLocaleString('pt-BR')} pts</h2>
            <dl>
              <div>
                <dt>Distância</dt>
                <dd>{result.distance.toLocaleString('pt-BR')} m</dd>
              </div>
              <div>
                <dt>Recorde</dt>
                <dd>
                  {result.best.toLocaleString('pt-BR')}
                  {result.newRecord ? <b> novo!</b> : null}
                </dd>
              </div>
            </dl>
          </>
        )}
        <div className="modal-actions">
          <button type="button" onClick={onRestart}>
            Correr de novo
          </button>
          <button type="button" className="secondary" onClick={backToMenu}>
            Menu principal
          </button>
        </div>
      </section>
    </div>
  );
}

type TouchKey = 'left' | 'right' | 'up' | 'down' | 'nitro';

function TouchButton({ flag, label, className }: { flag: TouchKey; label: string; className: string }) {
  const set = (value: boolean) => (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    touch[flag] = value;
  };
  return (
    <button
      type="button"
      className={`touch-button ${className}`}
      onPointerDown={set(true)}
      onPointerUp={set(false)}
      onPointerLeave={set(false)}
      onPointerCancel={set(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
}

/** Controles na tela, exibidos só em dispositivos de toque. */
export function TouchControls() {
  const phase = useGameStore((s) => s.phase);
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(pointer: coarse)');
    setCoarse(query.matches);
    const listener = (e: MediaQueryListEvent) => setCoarse(e.matches);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, []);
  if (!coarse || (phase !== 'running' && phase !== 'countdown')) return null;
  return (
    <div className="touch-controls">
      <div className="touch-left">
        <TouchButton flag="left" label="◀" className="steer" />
        <TouchButton flag="right" label="▶" className="steer" />
      </div>
      <div className="touch-right">
        <TouchButton flag="nitro" label="N2O" className="nitro" />
        <TouchButton flag="down" label="Freio" className="brake" />
        <TouchButton flag="up" label="Acel" className="gas" />
      </div>
    </div>
  );
}
