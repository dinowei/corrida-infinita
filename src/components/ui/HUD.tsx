type HUDProps = {
  speed: number;
  distance: number;
  nitro: number;
  score: number;
  best: number;
  tip: string;
  countdownText: string;
  showCountdown: boolean;
};

export default function HUD({
  speed,
  distance,
  nitro,
  score,
  best,
  tip,
  countdownText,
  showCountdown,
}: HUDProps) {
  return (
    <>
      <header className="top-bar">
        <div className="brand-pill">Corrida Infinita</div>
        <div className="stat-pill">Distância: {distance} m</div>
        <div className="stat-pill">Score: {score}</div>
        <div className="stat-pill">Recorde: {best}</div>
      </header>

      {showCountdown ? (
        <div className="countdown-overlay" aria-live="assertive">
          <div className={`countdown-text ${countdownText === 'GO!' ? 'go' : ''}`}>
            {countdownText}
          </div>
        </div>
      ) : null}

      <div className="speedometer">
        <div className="speed-label">Velocidade</div>
        <div className="speed-value">{speed}</div>
        <div className="speed-unit">km/h</div>
        <div className="speed-track">
          <div className="speed-fill" style={{ width: `${Math.min(100, (speed / 320) * 100)}%` }} />
        </div>
        <div className="nitro-label">NITRO {nitro}%</div>
        <div className="nitro-track">
          <div className="nitro-fill" style={{ width: `${nitro}%` }} />
        </div>
      </div>

      <div className="tip-card">{tip}</div>
    </>
  );
}
