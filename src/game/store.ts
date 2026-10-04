import { create } from 'zustand';
import type {
  GameMode,
  GamePhase,
  HudState,
  MinimapDot,
  RaceResult,
  VehicleId,
} from '../types/game';
import type { QualityLevel, WeatherId } from './contracts';
import { detectQuality } from './quality';
import { loadSave, saveSettings } from './save';

const initialHud = (): HudState => ({
  speed: 0,
  nitro: 100,
  distance: 0,
  score: 0,
  best: loadSave().bestScore,
  hull: 100,
  lap: 1,
  totalLaps: 3,
  lapTime: 0,
  bestLap: null,
  raceTime: 0,
  position: 1,
  racers: 1,
  offTrack: false,
});

type GameStore = {
  phase: GamePhase;
  mode: GameMode;
  vehicleId: VehicleId;
  weather: WeatherId;
  quality: QualityLevel;
  showStats: boolean;
  runId: number;
  countdown: string;
  /** a cena 3D já renderizou o primeiro frame */
  sceneReady: boolean;
  hud: HudState;
  minimap: MinimapDot[];
  minimapPath: string;
  toast: { text: string; id: number } | null;
  result: RaceResult | null;

  setMode: (mode: GameMode) => void;
  setVehicle: (id: VehicleId) => void;
  setWeather: (weather: WeatherId) => void;
  setQuality: (quality: QualityLevel) => void;
  toggleStats: () => void;
  setPhase: (phase: GamePhase) => void;
  setCountdown: (text: string) => void;
  markSceneReady: () => void;
  /** Atualiza só os campos que mudaram, para não re-renderizar a HUD à toa. */
  patchHud: (patch: Partial<HudState>) => void;
  setMinimap: (dots: MinimapDot[]) => void;
  setMinimapPath: (path: string) => void;
  showToast: (text: string) => void;
  newRun: () => void;
  finish: (result: RaceResult) => void;
  togglePause: () => void;
  backToMenu: () => void;
};

const savedSettings = loadSave().settings;

export const useGameStore = create<GameStore>((set, get) => ({
  phase: 'menu',
  mode: 'circuit',
  vehicleId: 'gtr',
  weather: savedSettings.weather,
  quality: savedSettings.quality ?? (typeof document !== 'undefined' ? detectQuality() : 'low'),
  showStats: savedSettings.showStats,
  runId: 0,
  countdown: '',
  sceneReady: false,
  hud: initialHud(),
  minimap: [],
  minimapPath: '',
  toast: null,
  result: null,

  setMode: (mode) => set({ mode }),
  setVehicle: (vehicleId) => set({ vehicleId }),
  setWeather: (weather) => {
    saveSettings({ weather });
    set({ weather });
  },
  setQuality: (quality) => {
    saveSettings({ quality });
    set({ quality });
  },
  toggleStats: () => {
    const showStats = !get().showStats;
    saveSettings({ showStats });
    set({ showStats });
  },
  setPhase: (phase) => set({ phase }),
  setCountdown: (countdown) => set({ countdown }),
  markSceneReady: () => {
    if (!get().sceneReady) set({ sceneReady: true });
  },
  patchHud: (patch) => {
    const hud = get().hud;
    let changed = false;
    for (const key in patch) {
      const k = key as keyof HudState;
      if (hud[k] !== patch[k]) {
        changed = true;
        break;
      }
    }
    if (changed) set({ hud: { ...hud, ...patch } });
  },
  setMinimap: (minimap) => set({ minimap }),
  setMinimapPath: (minimapPath) => set({ minimapPath }),
  showToast: (text) => set({ toast: { text, id: Date.now() + Math.random() } }),
  newRun: () =>
    set((state) => ({
      runId: state.runId + 1,
      hud: initialHud(),
      minimap: [],
      toast: null,
      result: null,
      countdown: '',
      sceneReady: false,
    })),
  finish: (result) => set({ phase: 'finished', result }),
  togglePause: () => {
    const { phase } = get();
    if (phase === 'running') set({ phase: 'paused' });
    else if (phase === 'paused') set({ phase: 'running' });
  },
  backToMenu: () => set({ phase: 'menu', result: null, countdown: '' }),
}));

/** Leitura sem assinatura, para uso dentro de useFrame. */
export const getPhase = () => useGameStore.getState().phase;

if (import.meta.env.DEV && typeof window !== 'undefined') Object.assign(window, { __store: useGameStore });
