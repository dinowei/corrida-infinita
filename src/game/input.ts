import type { ControlState } from '../types/game';

/**
 * Controlador único de entrada. Teclado e toque marcam flags; o gamepad é
 * lido sob demanda em `read()`, que é chamado uma vez por frame pela cena.
 */
type Flags = { left: boolean; right: boolean; up: boolean; down: boolean; nitro: boolean };

const blank = (): Flags => ({ left: false, right: false, up: false, down: false, nitro: false });

const keyboard: Flags = blank();
export const touch: Flags = blank();

let pauseListener: (() => void) | null = null;
let lastStartPressed = false;
let installed = false;

const KEY_MAP: Record<string, keyof Flags> = {
  arrowleft: 'left',
  a: 'left',
  arrowright: 'right',
  d: 'right',
  arrowup: 'up',
  w: 'up',
  arrowdown: 'down',
  s: 'down',
  ' ': 'nitro',
  shift: 'nitro',
};

function onKey(pressed: boolean) {
  return (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if (pressed && (key === 'escape' || key === 'p') && !event.repeat) {
      pauseListener?.();
      return;
    }
    const flag = KEY_MAP[key];
    if (!flag) return;
    keyboard[flag] = pressed;
    if (key === ' ' || key.startsWith('arrow')) event.preventDefault();
  };
}

function releaseAll() {
  Object.assign(keyboard, blank());
  Object.assign(touch, blank());
}

export function installInput(onPause: () => void) {
  pauseListener = onPause;
  if (installed) return () => undefined;
  installed = true;
  const down = onKey(true);
  const up = onKey(false);
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', releaseAll);
  return () => {
    installed = false;
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    window.removeEventListener('blur', releaseAll);
  };
}

function readGamepad() {
  const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
  for (const pad of pads) {
    if (!pad || !pad.connected) continue;
    const axis = pad.axes[0] ?? 0;
    const dead = Math.abs(axis) < 0.14 ? 0 : axis;
    const dpad = (pad.buttons[15]?.pressed ? 1 : 0) - (pad.buttons[14]?.pressed ? 1 : 0);
    const startPressed = Boolean(pad.buttons[9]?.pressed);
    if (startPressed && !lastStartPressed) pauseListener?.();
    lastStartPressed = startPressed;
    return {
      steer: dpad !== 0 ? dpad : dead,
      throttle: Math.max(pad.buttons[7]?.value ?? 0, pad.buttons[0]?.pressed ? 1 : 0),
      brake: Math.max(pad.buttons[6]?.value ?? 0, pad.buttons[1]?.pressed ? 1 : 0),
      nitro: Boolean(pad.buttons[5]?.pressed || pad.buttons[2]?.pressed),
    };
  }
  return null;
}

const out: ControlState = { steer: 0, throttle: 0, brake: 0, nitro: false };

/** Substitui a entrada (usado só por testes automatizados em dev). */
let override: Partial<ControlState> | null = null;
export function setControlOverride(next: Partial<ControlState> | null) {
  override = next;
}
if (import.meta.env.DEV && typeof window !== 'undefined') Object.assign(window, { __input: { setControlOverride } });

export function readControls(): ControlState {
  const pad = readGamepad();
  const digitalSteer =
    (keyboard.right || touch.right ? 1 : 0) - (keyboard.left || touch.left ? 1 : 0);
  out.steer = Math.max(-1, Math.min(1, digitalSteer + (pad?.steer ?? 0)));
  out.throttle = Math.max(keyboard.up || touch.up ? 1 : 0, pad?.throttle ?? 0);
  out.brake = Math.max(keyboard.down || touch.down ? 1 : 0, pad?.brake ?? 0);
  out.nitro = keyboard.nitro || touch.nitro || Boolean(pad?.nitro);
  if (override) Object.assign(out, override);
  return out;
}
