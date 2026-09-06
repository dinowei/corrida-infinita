type AudioKit = {
  ctx: AudioContext;
  master: GainNode;
  sfx: GainNode;
  engine: OscillatorNode;
  engineGain: GainNode;
  engineFilter: BiquadFilterNode;
};

let kit: AudioKit | null = null;
let muted = false;

function ensure(): AudioKit | null {
  if (typeof window === "undefined") return null;
  if (kit) return kit;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  const ctx = new Ctor({ latencyHint: "interactive" });
  const master = ctx.createGain();
  const sfx = ctx.createGain();
  master.gain.value = muted ? 0 : 0.7;
  sfx.gain.value = 0.85;
  sfx.connect(master);
  master.connect(ctx.destination);

  const engine = ctx.createOscillator();
  const engineGain = ctx.createGain();
  const engineFilter = ctx.createBiquadFilter();
  engine.type = "sawtooth";
  engine.frequency.value = 48;
  engineFilter.type = "lowpass";
  engineFilter.frequency.value = 420;
  engineGain.gain.value = 0;
  engine.connect(engineFilter);
  engineFilter.connect(engineGain);
  engineGain.connect(master);
  engine.start();

  kit = { ctx, master, sfx, engine, engineGain, engineFilter };
  return kit;
}

export function unlockAudio() {
  const k = ensure();
  if (!k) return;
  if (k.ctx.state === "suspended") void k.ctx.resume();
}

export function setMuted(next: boolean) {
  muted = next;
  if (!kit) return;
  kit.master.gain.setTargetAtTime(next ? 0 : 0.7, kit.ctx.currentTime, 0.03);
}

export function isMuted() {
  return muted;
}

export function setEngine(speedKmh: number, nitro: boolean, running: boolean) {
  const k = kit;
  if (!k) return;
  const t = k.ctx.currentTime;
  const norm = Math.min(1, speedKmh / 240);
  const freq = 42 + norm * 86 + (nitro ? 18 : 0);
  const vol = running ? 0.018 + norm * 0.045 : 0;
  k.engine.frequency.setTargetAtTime(freq, t, 0.05);
  k.engineFilter.frequency.setTargetAtTime(320 + norm * 900, t, 0.08);
  k.engineGain.gain.setTargetAtTime(vol, t, 0.08);
}

function blip(freq: number, dur: number, type: OscillatorType, gain = 0.12) {
  const k = kit;
  if (!k) return;
  const t = k.ctx.currentTime;
  const osc = k.ctx.createOscillator();
  const g = k.ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  g.connect(k.sfx);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export function sfxCountdown() {
  blip(520, 0.12, "square", 0.08);
}
export function sfxGo() {
  blip(880, 0.22, "triangle", 0.1);
  blip(440, 0.28, "sawtooth", 0.05);
}
export function sfxPickup() {
  blip(740, 0.1, "sine", 0.09);
  blip(1180, 0.16, "triangle", 0.06);
}
export function sfxNearMiss() {
  blip(210, 0.08, "square", 0.05);
}
export function sfxCrash() {
  const k = kit;
  if (!k) return;
  const t = k.ctx.currentTime;
  const buffer = k.ctx.createBuffer(1, k.ctx.sampleRate * 0.35, k.ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  }
  const src = k.ctx.createBufferSource();
  const g = k.ctx.createGain();
  const f = k.ctx.createBiquadFilter();
  src.buffer = buffer;
  f.type = "lowpass";
  f.frequency.value = 700;
  g.gain.setValueAtTime(0.28, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  src.connect(f);
  f.connect(g);
  g.connect(k.sfx);
  src.start(t);
}
