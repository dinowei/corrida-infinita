import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

// =====================
// Game constants
// =====================
const MAX_SPEED = 120; // km/h
const ACCELERATION_RATE = 0.5;
const BRAKE_RATE = 1.0;
const DRAG_COEFFICIENT = 0.05;
const ROAD_LENGTH = 1000;
const SENSIBILITY = 0.02;
const NUM_COMPETITORS = 15; // Número de carros controlados pela IA

// =====================
// Type Definitions
// =====================
interface Racer {
  id: string;
  distance: number;
  isPlayer: boolean;
}

interface AICompetitor {
    id: string;
    mesh: THREE.Mesh;
    speed: number;
    targetX: number;
    distance: number;
}

interface DustParticle {
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    life: number;
}

// Inject CSS once
function ensureStylesInjected() {
  const STYLE_ID = 'infinite-race-3d-styles';
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
  .App { position: relative; width: 100%; height: 100vh; overflow: hidden; font-family: Arial, sans-serif; color: white; }
  .three-container { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1; }
  .game-ui { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 2; pointer-events: none; padding: 20px; box-sizing: border-box; }
  .start-screen { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 3; background: rgba(0,0,0,0.7); padding: 30px; border-radius: 15px; text-align: center; pointer-events: auto; }
  .start-screen button { background: #e74c3c; color: white; border: none; padding: 15px 30px; font-size: 1.2em; border-radius: 30px; cursor: pointer; transition: all 0.3s; margin-bottom: 20px; }
  .start-screen button:hover { background: #c0392b; transform: scale(1.05); }
  .speedometer { position: absolute; bottom: 50px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.6); padding: 15px 30px; border-radius: 30px; min-width: 150px; text-align: center; }
  .speed-value { font-size: 3em; font-weight: bold; margin-bottom: -10px; }
  .speed-unit { font-size: 1.2em; opacity: 0.8; }
  .speed-bar { height: 5px; background: linear-gradient(to right, #2ecc71, #f1c40f, #e74c3c); border-radius: 5px; margin-top: 10px; transition: width 0.2s; }
  .stats { position: absolute; top: 20px; left: 20px; background: rgba(0,0,0,0.6); padding: 15px; border-radius: 10px; font-size: 1.2em; }
  .ranking { position: absolute; top: 20px; right: 20px; background: rgba(0,0,0,0.6); padding: 15px; border-radius: 10px; max-width: 250px; }
  .ranking h2 { margin-top: 0; border-bottom: 1px solid rgba(255,255,255,0.3); padding-bottom: 5px; }
  .ranking ul { list-style: none; padding: 0; margin: 0; }
  .ranking li { padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); }
  .ranking li.player { color: #f1c40f; font-weight: bold; }
  .notifications { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; }
  .notification { background: rgba(231,76,60,0.8); padding: 10px 20px; border-radius: 30px; margin: 10px 0; animation: fadeInOut 3s forwards; }
  @keyframes fadeInOut { 0%{opacity:0;transform:translateY(20px);} 10%{opacity:1;transform:translateY(0);} 90%{opacity:1;transform:translateY(0);} 100%{opacity:0;transform:translateY(-20px);} }
  `;
  document.head.appendChild(style);
}


function App() {
  const [isRaceStarted, setIsRaceStarted] = useState(false);
  const [isAccelerating, setIsAccelerating] = useState(false);
  const [isBraking, setIsBraking] = useState(false);
  const [speed, setSpeed] = useState(0);
  const [distance, setDistance] = useState(0);
  const [sessionTime, setSessionTime] = useState(0);
  const [ranking, setRanking] = useState<Racer[]>([]);
  const [notifications, setNotifications] = useState<string[]>([]);
  const [playerId] = useState(() => `P${Math.floor(Math.random() * 1000)}`);

  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const composerRef = useRef<EffectComposer | null>(null);
  const carRef = useRef<THREE.Mesh | null>(null);
  const roadRef = useRef<THREE.Mesh | null>(null);
  const speedLinesRef = useRef<THREE.Group | null>(null);
  const dustParticlesRef = useRef<THREE.Points | null>(null);
  const competitorsRef = useRef<AICompetitor[]>([]);
  
  const carPositionRef = useRef(0);

  const speedRef = useRef(0);
  const distanceRef = useRef(0);

  // Inicializa a cena 3D
  useEffect(() => {
    ensureStylesInjected();
    if (!mountRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 50, 200);

    const camera = new THREE.PerspectiveCamera(75, mountRef.current.clientWidth / mountRef.current.clientHeight, 0.1, 1000);
    camera.position.set(0, 3, 5);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.shadowMap.enabled = true;
    mountRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enabled = false;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 15);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Pista
    const roadGeometry = new THREE.PlaneGeometry(10, ROAD_LENGTH);
    const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9, metalness: 0.1 });
    const road = new THREE.Mesh(roadGeometry, roadMaterial);
    road.rotation.x = -Math.PI / 2;
    road.position.z = -ROAD_LENGTH / 2;
    road.receiveShadow = true;
    scene.add(road);
    roadRef.current = road;

    // Faixas da pista
    const laneMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (let i = 0; i < ROAD_LENGTH / 10; i++) {
      const lineGeometry = new THREE.PlaneGeometry(0.5, 2);
      const line = new THREE.Mesh(lineGeometry, laneMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(0, 0.01, -i * 10);
      road.add(line);
    }

    // Carro do jogador
    const carGeometry = new THREE.BoxGeometry(1.5, 0.5, 3);
    const carMaterial = new THREE.MeshPhongMaterial({ color: 0xff4136 });
    const car = new THREE.Mesh(carGeometry, carMaterial);
    car.position.y = 0.25;
    car.castShadow = true;
    scene.add(car);
    carRef.current = car;

    // Competidores (IA)
    const competitorColors = [0x0074D9, 0x2ECC40, 0xFFDC00, 0x7FDBFF, 0x39CCCC];
    competitorsRef.current = [];
    for (let i = 0; i < NUM_COMPETITORS; i++) {
        const competitorCar = new THREE.Mesh(
            carGeometry,
            new THREE.MeshPhongMaterial({ color: competitorColors[i % competitorColors.length] })
        );
        competitorCar.position.y = 0.25;
        competitorCar.castShadow = true;
        
        // Posição inicial aleatória
        competitorCar.position.x = (Math.random() - 0.5) * 8;
        competitorCar.position.z = -Math.random() * ROAD_LENGTH;

        const ai: AICompetitor = {
            id: `AI_${i}`,
            mesh: competitorCar,
            speed: MAX_SPEED * (0.7 + Math.random() * 0.25), // 70% a 95% da vel. max.
            targetX: competitorCar.position.x,
            distance: 0
        };
        competitorsRef.current.push(ai);
        scene.add(competitorCar);
    }

    // Ambiente
    const treeGeometry = new THREE.ConeGeometry(1, 3, 8);
    const treeMaterial = new THREE.MeshStandardMaterial({ color: 0x00aa00 });
    for (let i = 0; i < 50; i++) {
      const tree = new THREE.Mesh(treeGeometry, treeMaterial);
      tree.position.set((Math.random() > 0.5 ? 8 : -8) + (Math.random() - 0.5) * 2, 1.5, -Math.random() * ROAD_LENGTH);
      tree.castShadow = true;
      scene.add(tree);
    }

    // Efeito: Linhas de velocidade
    const speedLines = new THREE.Group();
    const lineMaterial2 = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
    for (let i = 0; i < 100; i++) {
      const p1 = new THREE.Vector3((Math.random() - 0.5) * 10, Math.random() * 5, Math.random() * 10);
      const p2 = new THREE.Vector3((Math.random() - 0.5) * 20, Math.random() * 2, Math.random() * 20 + 10);
      const lineGeometry = new THREE.BufferGeometry().setFromPoints([p1, p2]);
      const line = new THREE.Line(lineGeometry, lineMaterial2);
      speedLines.add(line);
    }
    scene.add(speedLines);
    speedLinesRef.current = speedLines;

    // Efeito: Partículas de poeira/fumaça
    const dustGeo = new THREE.BufferGeometry();
    const dustVertices = [];
    for (let i = 0; i < 200; i++) {
        dustVertices.push(0, 0, 0);
    }
    dustGeo.setAttribute('position', new THREE.Float32BufferAttribute(dustVertices, 3));
    const dustMat = new THREE.PointsMaterial({
        color: 0x666666,
        size: 0.1,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending
    });
    const dustParticles = new THREE.Points(dustGeo, dustMat);
    (dustParticles.userData.particles as DustParticle[]) = [];
    for (let i = 0; i < 200; i++) {
        dustParticles.userData.particles.push({
            position: new THREE.Vector3(),
            velocity: new THREE.Vector3(),
            life: 0
        });
    }
    scene.add(dustParticles);
    dustParticlesRef.current = dustParticles;

    // Pós-processamento (Efeito Bloom para Motion Blur)
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.5, 0.1, 0.1);
    composer.addPass(bloomPass);
    composerRef.current = composer;

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;

    renderer.render(scene, camera);

    const handleResize = () => {
        if (cameraRef.current && rendererRef.current && composerRef.current && mountRef.current) {
            const { clientWidth, clientHeight } = mountRef.current;
            cameraRef.current.aspect = clientWidth / clientHeight;
            cameraRef.current.updateProjectionMatrix();
            rendererRef.current.setSize(clientWidth, clientHeight);
            composerRef.current.setSize(clientWidth, clientHeight);
        }
    };
    window.addEventListener('resize', handleResize);

    return () => {
        window.removeEventListener('resize', handleResize);
        if (mountRef.current && rendererRef.current) {
            mountRef.current.removeChild(rendererRef.current.domElement);
        }
    };
  }, []);

  // Lógica de controle do jogador
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') setIsAccelerating(true);
      if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') setIsBraking(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') setIsAccelerating(false);
      if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') setIsBraking(false);
    };
    const handleMouseMove = (e: MouseEvent) => {
        if (!isRaceStarted) return;
        carPositionRef.current = (e.clientX / window.innerWidth - 0.5) * 2;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [isRaceStarted]);

  // Loop principal do jogo (requestAnimationFrame)
  useEffect(() => {
    if (!isRaceStarted) return;

    let lastTime = performance.now();
    let animationFrameId: number;

    const gameLoop = (time: number) => {
      const deltaTime = (time - lastTime) / 1000; // segundos
      lastTime = time;

      // Atualiza velocidade do jogador
      let currentSpeed = speedRef.current;
      if (isAccelerating) currentSpeed += ACCELERATION_RATE;
      if (isBraking) currentSpeed -= BRAKE_RATE;
      currentSpeed -= currentSpeed * DRAG_COEFFICIENT * deltaTime * 60; // Drag
      currentSpeed = Math.max(0, Math.min(currentSpeed, MAX_SPEED));
      speedRef.current = currentSpeed;

      // Atualiza distância
      const distanceDelta = (currentSpeed / 3.6) * deltaTime; // m/s * s
      distanceRef.current += distanceDelta;

      // Atualiza posição do carro do jogador
      if (carRef.current) {
        const targetX = carPositionRef.current * 4; // Mapeia -1..1 para -4..4 (largura da pista)
        carRef.current.position.x += (targetX - carRef.current.position.x) * SENSIBILITY * 10; // Increased smoothness
      }

      // Atualiza câmera
      if (cameraRef.current && carRef.current) {
        cameraRef.current.position.z = carRef.current.position.z + 5;
        cameraRef.current.position.x = carRef.current.position.x * 0.2; // Câmera se move um pouco com o carro
        cameraRef.current.lookAt(carRef.current.position);
        
        // Efeito de vibração da câmera em alta velocidade
        const speedRatio = currentSpeed / MAX_SPEED;
        if (speedRatio > 0.5) {
            const shakeIntensity = (speedRatio - 0.5) * 0.05;
            cameraRef.current.position.x += (Math.random() - 0.5) * shakeIntensity;
            cameraRef.current.position.y += (Math.random() - 0.5) * shakeIntensity + 3;
        } else {
            cameraRef.current.position.y = 3;
        }
      }

      // Atualiza posição da pista (efeito de loop infinito)
      if (roadRef.current && carRef.current) {
        carRef.current.position.z -= distanceDelta;
        roadRef.current.position.z = carRef.current.position.z % 10;
      }

      // Atualiza competidores (IA)
      competitorsRef.current.forEach(ai => {
        const aiSpeedMs = ai.speed / 3.6;
        ai.mesh.position.z -= (currentSpeed / 3.6 - aiSpeedMs) * deltaTime;
        ai.distance += aiSpeedMs * deltaTime;

        // Lógica simples de IA: muda de faixa para evitar colisões
        if (Math.random() < 0.01) { // Chance de mudar de faixa
            ai.targetX = (Math.random() - 0.5) * 8;
        }
        ai.mesh.position.x += (ai.targetX - ai.mesh.position.x) * 0.01;

        // Reposiciona o carro da IA quando ele fica muito para trás ou para frente
        if (carRef.current) {
            if (ai.mesh.position.z > carRef.current.position.z + 20) {
                ai.mesh.position.z = carRef.current.position.z - ROAD_LENGTH + Math.random() * 50;
                ai.mesh.position.x = (Math.random() - 0.5) * 8;
            } else if (ai.mesh.position.z < carRef.current.position.z - ROAD_LENGTH) {
                ai.mesh.position.z = carRef.current.position.z - Math.random()*50;
            }
        }
      });

      // Atualiza efeitos visuais
      updateVisualEffects(currentSpeed, deltaTime);

      // Atualiza UI 
      setSpeed(currentSpeed);
      setDistance(distanceRef.current);
      setSessionTime(prev => prev + deltaTime);
      updateRanking();
      
      // Renderiza a cena
      if (composerRef.current) {
        composerRef.current.render();
      }

      animationFrameId = requestAnimationFrame(gameLoop);
    };

    const updateVisualEffects = (currentSpeed: number, deltaTime: number) => {
        const speedRatio = currentSpeed / MAX_SPEED;

        // Linhas de velocidade
        if (speedLinesRef.current) {
            speedLinesRef.current.visible = speedRatio > 0.3;
            speedLinesRef.current.children.forEach(line => {
                (line as THREE.Line).position.z += speedRatio * 2;
                if (line.position.z > 20) line.position.z = -20;
            });
        }

        // Partículas de poeira
        if (dustParticlesRef.current && carRef.current) {
            const particles = dustParticlesRef.current.userData.particles as DustParticle[];
            const positions = dustParticlesRef.current.geometry.attributes.position as THREE.BufferAttribute;
            let particleCount = 0;

            // Gera novas partículas
            const particlesToEmit = isBraking ? 5 : (speedRatio > 0.5 ? 2 : 0);
            for (let i = 0; i < particlesToEmit; i++) {
                const p = particles.find(p => p.life <= 0);
                if (p) {
                    p.life = Math.random() * 1.5;
                    p.position.set(
                        carRef.current.position.x + (Math.random() - 0.5) * 1.5, // Perto das rodas
                        0.1,
                        carRef.current.position.z + 1.5
                    );
                    p.velocity.set(
                        (Math.random() - 0.5) * 0.5,
                        Math.random() * 0.5,
                        -2 - Math.random() * 2
                    );
                }
            }

            // Atualiza partículas existentes
            particles.forEach((p, i) => {
                if (p.life > 0) {
                    p.life -= deltaTime;
                    p.position.addScaledVector(p.velocity, deltaTime);
                    positions.setXYZ(i, p.position.x, p.position.y, p.position.z);
                    particleCount++;
                } else {
                    positions.setXYZ(i, 0, -100, 0); // Esconde a partícula
                }
            });
            positions.needsUpdate = true;
            (dustParticlesRef.current.geometry as THREE.BufferGeometry).setDrawRange(0, particleCount);
        }
    };

    const updateRanking = () => {
        const playerRankData = { id: playerId, distance: distanceRef.current, isPlayer: true };
        const aiRanks = competitorsRef.current.map(ai => ({
            id: ai.id,
            distance: ai.distance,
            isPlayer: false
        }));
        const allRanks = [playerRankData, ...aiRanks].sort((a, b) => b.distance - a.distance);
        setRanking(allRanks.slice(0, 10)); // Mostra apenas o top 10
    };

    animationFrameId = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isRaceStarted, isAccelerating, isBraking, playerId]);

  const startGame = () => {
    setIsRaceStarted(true);
    distanceRef.current = 0;
    speedRef.current = 0;
    setSessionTime(0);
    // Reseta a posição dos competidores
    if (carRef.current) {
        carRef.current.position.set(0, 0.25, 0);
    }
    competitorsRef.current.forEach(ai => {
        ai.mesh.position.z = -Math.random() * ROAD_LENGTH;
        ai.distance = 0;
    });
  };

  return (
    <div className="App">
      <div ref={mountRef} className="three-container" />
      
      {!isRaceStarted && (
        <div className="start-screen">
          <h1>Corrida 3D</h1>
          <p>Use W/S ou as Setas para Cima/Baixo para acelerar/frear.<br/>Use o mouse para mover para os lados.</p>
          <button onClick={startGame}>Iniciar Corrida</button>
        </div>
      )}

      {isRaceStarted && (
        <div className="game-ui">
          <div className="stats">
            Distância: {Math.floor(distance)}m<br/>
            Tempo: {sessionTime.toFixed(1)}s
          </div>

          <div className="speedometer">
            <div className="speed-value">{Math.floor(speed)}</div>
            <div className="speed-unit">km/h</div>
            <div className="speed-bar" style={{ width: `${(speed / MAX_SPEED) * 100}%` }} />
          </div>

          <div className="ranking">
            <h2>Ranking</h2>
            <ul>
              {ranking.map((p, index) => (
                <li key={p.id} className={p.isPlayer ? 'player' : ''}>
                  {index + 1}. {p.id} ({Math.floor(p.distance)}m)
                </li>
              ))}
            </ul>
          </div>

          <div className="notifications">
            {notifications.map((note, index) => (
              <div key={index} className="notification">{note}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;