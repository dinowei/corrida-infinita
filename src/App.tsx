import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import HUD from './components/ui/HUD';
import StartScreen from './components/ui/StartScreen';
import { COUNTDOWN_STEPS } from './lib/game';
import { loadBest } from './game/save';
import { sfxCountdown, sfxGo, unlockAudio } from './game/audio';
import type { GamePhase, KeyboardState } from './types/game';

const GameScene = lazy(() => import('./components/GameScene'));

export default function App() {
  const keysRef = useRef<KeyboardState>({
    left: false,
    right: false,
    accelerate: false,
    brake: false,
    nitro: false,
  });

  const [gamePhase, setGamePhase] = useState<GamePhase>('idle');
  const [isStartScreenVisible, setIsStartScreenVisible] = useState(true);
  const [countdownText, setCountdownText] = useState('');
  const [speed, setSpeed] = useState(0);
  const [distance, setDistance] = useState(0);
  const [nitro, setNitro] = useState(100);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => loadBest());
  const [tip, setTip] = useState('Use A/D ou as setas para mudar de faixa. Segure Espaço para ativar o Nitro.');

  useEffect(() => {
    const onKeyChange = (pressed: boolean) => (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === 'arrowleft' || key === 'a') keysRef.current.left = pressed;
      if (key === 'arrowright' || key === 'd') keysRef.current.right = pressed;
      if (key === 'arrowup' || key === 'w') keysRef.current.accelerate = pressed;
      if (key === 'arrowdown' || key === 's') keysRef.current.brake = pressed;
      if (key === ' ' || key === 'shift') {
        keysRef.current.nitro = pressed;
        event.preventDefault();
      }
    };

    const handleKeyDown = onKeyChange(true);
    const handleKeyUp = onKeyChange(false);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', () => {
      keysRef.current.left = false;
      keysRef.current.right = false;
      keysRef.current.accelerate = false;
      keysRef.current.brake = false;
      keysRef.current.nitro = false;
    });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const startGame = async () => {
    if (gamePhase !== 'idle') return;

    unlockAudio();
    setIsStartScreenVisible(false);
    setTip('Preparando a cena 3D e o sistema de Nitro...');
    setGamePhase('countdown');

    await new Promise((resolve) => window.setTimeout(resolve, 320));

    for (const step of COUNTDOWN_STEPS) {
      setCountdownText(step);
      if (step === 'GO!') sfxGo();
      else sfxCountdown();
      await new Promise((resolve) => window.setTimeout(resolve, step === 'GO!' ? 520 : 700));
    }

    setCountdownText('');
    setGamePhase('running');
    setTip('Espaço/Shift: Nitro. Desvie do tráfego e faça quase-acidentes para pontuar.');
  };

  return (
    <div className="app-shell">
      <div className="three-stage">
        {gamePhase !== 'idle' ? (
          <Suspense fallback={<div className="scene-shell-loader">Inicializando o motor 3D...</div>}>
            <GameScene
              gamePhase={gamePhase}
              keyboardRef={keysRef}
              onSpeedChange={setSpeed}
              onDistanceChange={setDistance}
              onNitroChange={setNitro}
              onScoreChange={setScore}
              onBestChange={setBest}
            />
          </Suspense>
        ) : (
          <div className="scene-shell-loader">Pronto para carregar a pista AAA.</div>
        )}
      </div>

      <div className="ui-layer hud-container">
        <HUD
          speed={speed}
          distance={distance}
          nitro={nitro}
          score={score}
          best={best}
          tip={tip}
          countdownText={countdownText}
          showCountdown={gamePhase !== 'running' && countdownText.length > 0}
        />
        <StartScreen isVisible={isStartScreenVisible} onStart={startGame} />
      </div>
    </div>
  );
}
