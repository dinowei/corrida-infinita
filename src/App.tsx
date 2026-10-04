import { lazy, Suspense, useCallback, useEffect, useRef } from 'react';
import FrameStats from './components/ui/FrameStats';
import HUD from './components/ui/HUD';
import MainMenu from './components/ui/MainMenu';
import { PauseMenu, ResultsScreen, TouchControls } from './components/ui/Overlays';
import { setMuted, sfxCountdown, sfxGo, unlockAudio } from './game/audio';
import { loadSave } from './game/save';
import { installInput } from './game/input';
import { useGameStore } from './game/store';
import { COUNTDOWN_STEPS } from './lib/game';

const GameScene = lazy(() => import('./components/GameScene'));

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function waitForScene() {
  return new Promise<void>((resolve) => {
    if (useGameStore.getState().sceneReady) return resolve();
    const unsubscribe = useGameStore.subscribe((state) => {
      if (state.sceneReady || state.phase !== 'countdown') {
        unsubscribe();
        resolve();
      }
    });
  });
}

export default function App() {
  const phase = useGameStore((s) => s.phase);
  const mode = useGameStore((s) => s.mode);
  const vehicleId = useGameStore((s) => s.vehicleId);
  const runId = useGameStore((s) => s.runId);
  const countdownToken = useRef(0);

  useEffect(() => installInput(() => useGameStore.getState().togglePause()), []);

  useEffect(() => {
    setMuted(loadSave().settings.muted);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'F3') {
        event.preventDefault();
        useGameStore.getState().toggleStats();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const startRace = useCallback(async () => {
    const store = useGameStore.getState();
    unlockAudio();
    store.newRun();
    store.setPhase('countdown');
    const token = ++countdownToken.current;

    // Só conta depois que a cena 3D (modelos, texturas) renderizou.
    await waitForScene();
    await wait(500);
    for (const step of COUNTDOWN_STEPS) {
      if (token !== countdownToken.current || useGameStore.getState().phase !== 'countdown') return;
      useGameStore.getState().setCountdown(step);
      if (step === 'GO!') {
        sfxGo();
        useGameStore.getState().setPhase('running');
      } else {
        sfxCountdown();
      }
      await wait(step === 'GO!' ? 650 : 800);
    }
    if (token === countdownToken.current) useGameStore.getState().setCountdown('');
  }, []);

  return (
    <div className="app-shell">
      <div className="three-stage">
        {phase !== 'menu' ? (
          <Suspense fallback={<div className="scene-shell-loader">Inicializando o motor 3D...</div>}>
            <GameScene key={runId} mode={mode} vehicleId={vehicleId} />
          </Suspense>
        ) : (
          <div className="menu-backdrop" />
        )}
      </div>

      <div className="ui-layer">
        <HUD />
        <TouchControls />
        <FrameStats />
        {phase === 'menu' ? <MainMenu onStart={startRace} /> : null}
        <PauseMenu onRestart={startRace} />
        <ResultsScreen onRestart={startRace} />
      </div>
    </div>
  );
}
