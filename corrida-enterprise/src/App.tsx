import './App.css'
import { Game3D } from './components/Game3D'
import { useGameStore } from './store/gameStore'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import heroImg from './assets/hero.png'

function App() {
  const { boost, score, gameOver, addBoost, resetGame } = useGameStore()

  return (
    <>
      {/* Jogo 3D em tela cheia (fundo) */}
      <Game3D />

      {/* Interface sobreposta */}
      <div className="game-ui-overlay">
        <section id="center">
          <div className="hero">
            <img src={heroImg} className="base" width="170" height="179" alt="Carro base" />
            <img src={reactLogo} className="framework" alt="React logo" />
            <img src={viteLogo} className="vite" alt="Vite logo" />
          </div>

          <div>
            <h1>🏁 CORRIDA INFINITA 🏁</h1>
            <p>
              Acelere editando <code>src/App.tsx</code> e veja o <strong>HMR</strong> em ação.<br />
              <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>
                ⚡ Modo Forza ativado — cada clique é um turbo!
              </span>
            </p>
            <p className="score-display">🏆 PONTUAÇÃO: {score}</p>
            {gameOver && <p className="gameover-msg">💥 GAME OVER! 💥</p>}
          </div>

          <button
            className="counter"
            onClick={addBoost}
            aria-label="Aumentar boost"
          >
            🚀 BOOST: {boost}
          </button>

          {gameOver && (
            <button className="reset-button" onClick={resetGame}>
              🔄 REINICIAR CORRIDA
            </button>
          )}
        </section>

        <div className="ticks"></div>

        <section id="next-steps">
          <div id="docs">
            <svg className="icon" role="presentation" aria-hidden="true">
              <use href="/icons.svg#documentation-icon"></use>
            </svg>
            <h2>📘 Manual do Piloto</h2>
            <p>Dicas, truques e documentação</p>
            <ul>
              <li>
                <a href="https://vite.dev/" target="_blank" rel="noopener noreferrer">
                  <img className="logo" src={viteLogo} alt="" />
                  Vite — Motor do Jogo
                </a>
              </li>
              <li>
                <a href="https://react.dev/" target="_blank" rel="noopener noreferrer">
                  <img className="button-icon" src={reactLogo} alt="" />
                  React — Volante Digital
                </a>
              </li>
            </ul>
          </div>

          <div id="social">
            <svg className="icon" role="presentation" aria-hidden="true">
              <use href="/icons.svg#social-icon"></use>
            </svg>
            <h2>🏎️ Comunidade</h2>
            <p>Corra ao lado dos melhores</p>
            <ul>
              <li>
                <a href="https://github.com/vitejs/vite" target="_blank" rel="noopener noreferrer">
                  <svg className="button-icon" role="presentation" aria-hidden="true">
                    <use href="/icons.svg#github-icon"></use>
                  </svg>
                  GitHub Racing
                </a>
              </li>
              <li>
                <a href="https://chat.vite.dev/" target="_blank" rel="noopener noreferrer">
                  <svg className="button-icon" role="presentation" aria-hidden="true">
                    <use href="/icons.svg#discord-icon"></use>
                  </svg>
                  Discord — Box
                </a>
              </li>
              <li>
                <a href="https://x.com/vite_js" target="_blank" rel="noopener noreferrer">
                  <svg className="button-icon" role="presentation" aria-hidden="true">
                    <use href="/icons.svg#x-icon"></use>
                  </svg>
                  X.com — Últimas Voltas
                </a>
              </li>
              <li>
                <a href="https://bsky.app/profile/vite.dev" target="_blank" rel="noopener noreferrer">
                  <svg className="button-icon" role="presentation" aria-hidden="true">
                    <use href="/icons.svg#bluesky-icon"></use>
                  </svg>
                  Bluesky — Horizonte
                </a>
              </li>
            </ul>
          </div>
        </section>

        <div className="ticks"></div>
        <section id="spacer"></section>
      </div>
    </>
  )
}

export default App