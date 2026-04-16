import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from './store/gameStore';
import { InputManager } from './systems/input/InputManager';
import { CarPhysics } from './systems/physics/CarPhysics';
import { ChaseCamera } from './systems/camera/ChaseCamera';
import { AIDriver } from './systems/ai/AIDriver';
import { TrackGenerator } from './systems/world/TrackGenerator';
import { useGameLoop } from './hooks/useGameLoop';
import StartScreen from './components/UI/StartScreen';
import HUD from './components/UI/HUD';

function App() {
  const { isRaceStarted, startRace, updateStats, setRanking } = useGameStore();
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const carMeshRef = useRef<THREE.Mesh | null>(null);
  const aiCarsRef = useRef<any[]>([]);
  const physicsRef = useRef<CarPhysics>(new CarPhysics());
  const inputManagerRef = useRef(InputManager.getInstance());
  const aiDriverRef = useRef(new AIDriver());
  const trackGenRef = useRef<TrackGenerator | null>(null);
  let cameraController: ChaseCamera | null = null;

  // Inicialização da cena Three.js (similar à sua, mas com melhorias)
  useEffect(() => {
    if (!mountRef.current) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a1030);
    scene.fog = new THREE.FogExp2(0x0a1030, 0.008);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(65, mountRef.current.clientWidth / mountRef.current.clientHeight, 0.1, 1000);
    camera.position.set(0, 2.2, 4.5);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.shadowMap.enabled = true;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Luzes, carro, IA, etc. (reaproveitei seu código de criação de objetos)
    // ... (manter a criação de luzes, pista, carro, adversários, árvores)
    // Vou resumir aqui, mas você pode copiar a parte de criação do seu código original,
    // apenas substituindo as referências para usar as novas variáveis.

    // Criação do carro do jogador
    const carGeo = new THREE.BoxGeometry(1.4, 0.4, 2.6);
    const carMat = new THREE.MeshStandardMaterial({ color: 0xe63946, metalness: 0.7 });
    const car = new THREE.Mesh(carGeo, carMat);
    car.castShadow = true;
    scene.add(car);
    carMeshRef.current = car;

    // Criar IA (12 carros)
    // ... (igual ao seu, mas armazenar em aiCarsRef)

    trackGenRef.current = new TrackGenerator(scene);
    cameraController = new ChaseCamera(camera, car);

    const animate = () => {
      if (rendererRef.current && sceneRef.current && cameraRef.current)
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      requestAnimationFrame(animate);
    };
    animate();

    return () => {
      if (mountRef.current && rendererRef.current)
        mountRef.current.removeChild(rendererRef.current.domElement);
    };
  }, []);

  // Loop principal de física e atualização
  useGameLoop((deltaTime) => {
    if (!isRaceStarted || !carMeshRef.current || !cameraController) return;

    const input = inputManagerRef.current.getInput();
    const physics = physicsRef.current;
    const carState = physics.update(deltaTime, input, 10); // largura da pista = 10
    carMeshRef.current.position.copy(carState.position);
    carMeshRef.current.rotation.z = -carState.steeringAngle * 0.6;
    carMeshRef.current.rotation.x = carState.steeringAngle * 0.15;

    const distanceDelta = physics.getDistanceDelta(deltaTime);
    const newDistance = useGameStore.getState().distance + distanceDelta;
    const newTime = useGameStore.getState().sessionTime + deltaTime;
    updateStats(carState.speedKmh, newDistance, newTime);

    // Atualizar IA
    const playerZ = carMeshRef.current.position.z;
    aiCarsRef.current.forEach(ai => {
      aiDriverRef.current.update(ai, deltaTime, playerZ, 10);
    });

    // Atualizar câmera
    cameraController.update(deltaTime, carState.speedKmh);

    // Atualizar pista infinita
    trackGenRef.current?.update(playerZ);

    // Ranking (simplificado)
    const rankingList = [
      { id: 'Player', distance: newDistance, isPlayer: true },
      ...aiCarsRef.current.map(ai => ({ id: ai.id, distance: ai.distance, isPlayer: false }))
    ].sort((a, b) => b.distance - a.distance).slice(0, 10);
    setRanking(rankingList);
  }, isRaceStarted);

  return (
    <div className="App">
      <div ref={mountRef} style={{ width: '100vw', height: '100vh' }} />
      {!isRaceStarted && <StartScreen onStart={startRace} />}
      {isRaceStarted && <HUD />}
    </div>
  );
}

export default App;