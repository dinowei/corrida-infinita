import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import HUD from './components/ui/HUD';
import StartScreen from './components/ui/StartScreen';
import { COUNTDOWN_STEPS } from './lib/game';
import type { GamePhase, KeyboardState } from './types/game';

const GameScene = lazy(() => import('./components/GameScene'));

export default function App() {
  const keysRef = useRef<KeyboardState>({
    left: false,
    right: false,
    accelerate: false,
    brake: false,
  });

  const [gamePhase, setGamePhase] = useState<GamePhase>('idle');
  const [isStartScreenVisible, setIsStartScreenVisible] = useState(true);
  const [countdownText, setCountdownText] = useState('');
  const [speed, setSpeed] = useState(0);
  const [distance, setDistance] = useState(0);
  const [tip, setTip] = useState('Use A/D ou setas para mudar de faixa.');

  useEffect(() => {
    const onKeyChange = (pressed: boolean) => (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === 'arrowleft' || key === 'a') keysRef.current.left = pressed;
      if (key === 'arrowright' || key === 'd') keysRef.current.right = pressed;
      if (key === 'arrowup' || key === 'w') keysRef.current.accelerate = pressed;
      if (key === 'arrowdown' || key === 's' || key === ' ') keysRef.current.brake = pressed;
    };

    const handleKeyDown = onKeyChange(true);
    const handleKeyUp = onKeyChange(false);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const startGame = async () => {
    if (gamePhase !== 'idle') return;

    setIsStartScreenVisible(false);
    setTip('Preparando a cena 3D em background...');
    setGamePhase('countdown');

    await new Promise((resolve) => window.setTimeout(resolve, 320));

    for (const step of COUNTDOWN_STEPS) {
      setCountdownText(step);
      await new Promise((resolve) => window.setTimeout(resolve, step === 'GO!' ? 520 : 700));
    }

    setCountdownText('');
    setGamePhase('running');
    setTip('GT-R na pista: acelere, mantenha a linha e aproveite o asfalto premium.');
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
          tip={tip}
          countdownText={countdownText}
          showCountdown={gamePhase !== 'running' && countdownText.length > 0}
        />
        <StartScreen isVisible={isStartScreenVisible} onStart={startGame} />
      </div>
    </div>
  );
}
