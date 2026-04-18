type HUDProps = {
  speed: number;
  distance: number;
  tip: string;
  countdownText: string;
  showCountdown: boolean;
};

export default function HUD({
  speed,
  distance,
  tip,
  countdownText,
  showCountdown,
}: HUDProps) {
  return (
    <>
      <header className="top-bar">
        <div className="brand-pill">Corrida Infinita</div>
        <div className="stat-pill">Distancia: {distance} m</div>
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
          <div className="speed-fill" style={{ width: `${(speed / 248) * 100}%` }} />
        </div>
      </div>

      <div className="tip-card">{tip}</div>
    </>
  );
}
