import { useMemo } from 'react';
import { TRACKS } from '../../data/tracks';
import { WEATHER_LIST } from '../../data/weather';
import type { QualityLevel } from '../../game/contracts';
import { QUALITY } from '../../game/quality';
import { getRecord, loadSave } from '../../game/save';
import { useGameStore } from '../../game/store';
import { VEHICLE_LIST, vehicleRatings, type VehicleSpec } from '../../game/vehicles';
import { formatTime } from '../../lib/format';
import { raceKey } from '../../game/world/generator';
import type { GameMode } from '../../types/game';

const MODES: Array<{ id: GameMode; title: string; text: string }> = [
  {
    id: 'circuit',
    title: 'Circuito',
    text: '3 voltas no Viaduto Costa Neon contra 3 rivais. Freie antes das curvas fechadas.',
  },
  {
    id: 'infinite',
    title: 'Infinito',
    text: 'Desvie do tráfego ao pôr do sol. Quase-acidentes dão pontos e nitro; 3 batidas e acabou.',
  },
];

function VehicleBadge({ spec }: { spec: VehicleSpec }) {
  const { body, accent, stripe, glow } = spec.colors;
  if (spec.kind === 'car') {
    return (
      <svg viewBox="0 0 120 50" className="vehicle-badge" aria-hidden>
        <path d="M8 34 L22 22 L48 16 L80 16 L100 26 L114 30 L114 38 L8 38 Z" fill={body} stroke="#0b0f1a" strokeWidth="2.5" />
        <path d="M46 18 L78 18 L92 26 L40 26 Z" fill={accent} stroke="#0b0f1a" strokeWidth="2" />
        <circle cx="32" cy="38" r="8" fill="#111827" stroke="#0b0f1a" strokeWidth="2" />
        <circle cx="92" cy="38" r="8" fill="#111827" stroke="#0b0f1a" strokeWidth="2" />
        <rect x="104" y="28" width="9" height="4" fill={glow} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 120 50" className="vehicle-badge" aria-hidden>
      <ellipse cx="60" cy="44" rx="42" ry="4" fill={glow} opacity="0.45" />
      <path d="M6 30 L40 18 L92 16 L112 24 L112 34 L20 36 Z" fill={body} stroke="#0b0f1a" strokeWidth="2.5" />
      <path d="M44 18 L74 14 L86 20 L50 24 Z" fill="#123a7a" stroke="#0b0f1a" strokeWidth="2" />
      <rect x="70" y="26" width="38" height="12" rx="2" fill={body} stroke="#0b0f1a" strokeWidth="2.5" />
      <rect x="78" y="26" width="5" height="12" fill={accent} />
      <rect x="30" y="28" width="30" height="3" fill={stripe} />
      <rect x="108" y="28" width="6" height="8" fill={glow} />
    </svg>
  );
}

export default function MainMenu({ onStart }: { onStart: () => void }) {
  const mode = useGameStore((s) => s.mode);
  const vehicleId = useGameStore((s) => s.vehicleId);
  const setMode = useGameStore((s) => s.setMode);
  const setVehicle = useGameStore((s) => s.setVehicle);

  const weather = useGameStore((s) => s.weather);
  const quality = useGameStore((s) => s.quality);
  const setWeather = useGameStore((s) => s.setWeather);
  const setQuality = useGameStore((s) => s.setQuality);

  const records = useMemo(() => {
    const save = loadSave();
    const def = TRACKS[0];
    const key = raceKey({ trackId: def.id, trackVersion: def.version, biome: def.defaultBiome, weather, seed: def.seed });
    const track = getRecord(key);
    return { bestScore: save.bestScore, bestLap: track.bestLap, bestTotal: track.bestTotal };
  }, [weather]);

  return (
    <section className="main-menu">
      <header className="menu-header">
        <div className="eyebrow">Arcade · Hover · Asfalto</div>
        <h1>
          Corrida <span>Infinita</span>
        </h1>
      </header>

      <div className="menu-section">
        <h2>Modo</h2>
        <div className="mode-grid">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`mode-card${mode === m.id ? ' selected' : ''}`}
              onClick={() => setMode(m.id)}
            >
              <strong>{m.title}</strong>
              <span>{m.text}</span>
              <em>
                {m.id === 'circuit'
                  ? `Recorde: ${records.bestTotal ? formatTime(records.bestTotal) : '—'} · Volta: ${
                      records.bestLap ? formatTime(records.bestLap) : '—'
                    }`
                  : `Recorde: ${records.bestScore.toLocaleString('pt-BR')} pts`}
              </em>
            </button>
          ))}
        </div>
      </div>

      <div className="menu-section">
        <h2>Veículo</h2>
        <div className="vehicle-grid">
          {VEHICLE_LIST.map((v) => {
            const ratings = vehicleRatings(v);
            return (
              <button
                key={v.id}
                type="button"
                className={`vehicle-card${vehicleId === v.id ? ' selected' : ''}`}
                onClick={() => setVehicle(v.id)}
                style={{ ['--glow' as string]: v.colors.glow }}
              >
                <VehicleBadge spec={v} />
                <strong>{v.name}</strong>
                <span className="vehicle-tag">{v.tagline}</span>
                <div className="stat-bars">
                  {Object.entries(ratings).map(([label, value]) => (
                    <div key={label} className="stat-bar">
                      <span>{label}</span>
                      <div>
                        <i style={{ width: `${Math.round(Math.min(1, Math.max(0.08, value)) * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="menu-section menu-options">
        <div>
          <h2>Clima</h2>
          <div className="chip-row">
            {WEATHER_LIST.map((w) => (
              <button
                key={w.id}
                type="button"
                className={weather === w.id ? 'chip selected' : 'chip'}
                onClick={() => setWeather(w.id)}
                title={w.description}
              >
                {w.name}
              </button>
            ))}
          </div>
          <p className="option-note">{WEATHER_LIST.find((w) => w.id === weather)?.description}</p>
        </div>
        <div>
          <h2>Gráficos</h2>
          <div className="chip-row">
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
          <p className="option-note">Baixa é recomendada para GPUs integradas (Intel UHD).</p>
        </div>
      </div>

      <div className="menu-footer">
        <p className="controls-help">
          W/↑ acelera · S/↓ freia · A/D vira · Espaço nitro · Esc pausa · F3 desempenho · Gamepad: RT/LT, analógico, RB
        </p>
        <button type="button" className="start-button" onClick={onStart}>
          Correr
        </button>
      </div>
    </section>
  );
}
