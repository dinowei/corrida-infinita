const MAX = 360;
const START = 135; // graus
const SWEEP = 270;
const CX = 100;
const CY = 100;

function polar(angleDeg: number, radius: number) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: CX + Math.cos(a) * radius, y: CY + Math.sin(a) * radius };
}

function arc(fromDeg: number, toDeg: number, radius: number) {
  const a = polar(fromDeg, radius);
  const b = polar(toDeg, radius);
  const large = toDeg - fromDeg > 180 ? 1 : 0;
  return `M${a.x.toFixed(2)} ${a.y.toFixed(2)} A${radius} ${radius} 0 ${large} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

const TICKS = Array.from({ length: MAX / 20 + 1 }, (_, i) => i * 20);

/** Velocímetro analógico em SVG com arco de nitro interno. */
export default function Speedometer({ speed, nitro }: { speed: number; nitro: number }) {
  const ratio = Math.min(1, speed / MAX);
  const needle = START + ratio * SWEEP;
  const tip = polar(needle, 70);
  const nitroEnd = START + (Math.max(0.5, nitro) / 100) * SWEEP;

  return (
    <div className="speedometer" aria-label={`${speed} km/h, nitro ${nitro}%`}>
      <svg viewBox="0 0 200 200">
        <circle cx={CX} cy={CY} r={92} className="gauge-bg" />
        <path d={arc(START, START + SWEEP, 80)} className="gauge-track" />
        <path d={arc(START + (240 / MAX) * SWEEP, START + SWEEP, 80)} className="gauge-redline" />
        {ratio > 0.002 ? <path d={arc(START, needle, 80)} className="gauge-fill" /> : null}
        <path d={arc(START, START + SWEEP, 62)} className="nitro-track-arc" />
        <path d={arc(START, nitroEnd, 62)} className="nitro-fill-arc" />
        {TICKS.map((value) => {
          const angle = START + (value / MAX) * SWEEP;
          const major = value % 40 === 0;
          const a = polar(angle, major ? 70 : 74);
          const b = polar(angle, 84);
          const label = polar(angle, 55);
          return (
            <g key={value}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={major ? 'tick major' : 'tick'} />
              {major && value > 0 && value < MAX ? (
                <text x={label.x} y={label.y} className="tick-label">
                  {value}
                </text>
              ) : null}
            </g>
          );
        })}
        <line x1={CX} y1={CY} x2={tip.x} y2={tip.y} className="needle" />
        <circle cx={CX} cy={CY} r={7} className="needle-hub" />
        <text x={CX} y={CY + 40} className="speed-readout">
          {speed}
        </text>
        <text x={CX} y={CY + 56} className="speed-unit-text">
          KM/H
        </text>
      </svg>
      <div className={`nitro-chip${nitro >= 99 ? ' full' : ''}`}>NITRO {nitro}%</div>
    </div>
  );
}
