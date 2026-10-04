# Corrida Infinita

Jogo de corrida arcade 3D para navegador (React + Three.js). Dois modos jogáveis, três veículos (um carro e duas naves hover), dois climas e progresso salvo localmente.

## Como rodar

```bash
npm install
npm run dev
```

Abra `http://localhost:5173`.

| Comando | O que faz |
| --- | --- |
| `npm run dev` | servidor de desenvolvimento |
| `npm run typecheck` | checagem de tipos (TypeScript) |
| `npm test` | testes determinísticos da simulação (Vitest) |
| `npm run build` | build de produção |
| `npm run check` | os três acima, em sequência — rode antes de cada commit |

Durante o jogo, **F3** mostra FPS e frame time (média, p95 e pior quadro).

## Modos

| Modo | Objetivo |
| --- | --- |
| **Circuito** | 3 voltas no *Viaduto Costa Neon* (≈1,9 km, spline fechada com elevação e inclinação nas curvas) contra 3 rivais com IA. Checkpoints ordenados com 3 setores e parciais, melhor volta, posição, minimapa e recordes por combinação de pista e clima. |
| **Infinito** | Estrada sem fim ao pôr do sol com tráfego. Quase-acidentes dão pontos e nitro. Cada batida tira integridade; 3 batidas encerram a corrida. |

## Clima e qualidade

| Clima | Efeito visual | Efeito na condução |
| --- | --- | --- |
| Céu limpo | sol alto, visibilidade total | — |
| Chuva leve | céu cinza, névoa a ~300 m, asfalto molhado refletivo, chuva em GPU | aderência −20%, caindo mais acima de 140 km/h (aquaplanagem); frenagem −22% |

Perfis gráficos **Baixa / Média / Alta** controlam resolução (DPR), pós-processamento, quantidade de gotas e densidade do cenário. GPUs integradas (Intel UHD etc.) começam em Baixa automaticamente; a escolha fica salva.

## Veículos

| Veículo | Classe | Perfil |
| --- | --- | --- |
| GT-R R35 | equilibrado (carro, GLB) | estável no seco e na chuva |
| Aurora RE-0 | leve (hover procedural) | o mais rápido no seco, o que mais sofre na chuva |
| Vespa MX-05 | pesado (hover procedural) | nitro forte, curva larga |

As naves são geradas em código (`HoverShip.tsx`): casco facetado, cockpit, motores hexagonais com brilho neon e contorno estilo HQ.

## Controles

| Ação | Teclado | Gamepad | Toque |
| --- | --- | --- | --- |
| Acelerar | W / ↑ | RT ou A | Acel |
| Frear | S / ↓ | LT ou B | Freio |
| Virar | A / D, ← / → | analógico esquerdo / D-pad | ◀ ▶ |
| Nitro | Espaço / Shift | RB ou X | N2O |
| Pausar | Esc / P | Start | ❚❚ |
| Desempenho | F3 | — | menu de pausa |

## Estrutura

A regra de jogo não depende do render: cada modo é uma *sessão* pura (`RaceSession`) que recebe `update(dt, input)` e expõe HUD, eventos e resultado. Os componentes React só desenham o estado da sessão. Isso permite testar corridas inteiras sem navegador.

```
src/
  App.tsx                      fluxo: menu → contagem → corrida → resultado
  data/                        conteúdo por dados: pistas, biomas, climas, rivais
  game/
    contracts.ts               TrackDefinition, BiomeDefinition, WeatherDefinition, RaceSession…
    modes/circuitSession.ts    física sobre a spline, IA, checkpoints, setores, voltas
    modes/infiniteSession.ts   estrada infinita, tráfego com seed, integridade
    world/generator.ts         RNG com seed, versão do gerador, chave da corrida
    world/scenery.ts           cenário procedural (árvores, prédios, montanhas)
    tracks.ts                  spline → frames (curvatura, banking, elevação)
    vehicles.ts                catálogo e classes dos veículos
    quality.ts                 perfis Baixa/Média/Alta e detecção de GPU
    store.ts                   estado global (zustand)
    input.ts                   teclado + gamepad + toque
    save.ts                    save versionado com migração (v1 → v3)
    __tests__/                 testes da simulação
  components/
    GameScene.tsx              Canvas, câmera e pós-processamento
    modes/                     render de cada modo (lê a sessão)
    scene/                     malha da pista, cenário, chuva
    vehicles/                  GT-R (GLB), nave hover procedural
    ui/                        menu, HUD, velocímetro, minimapa, pausa, resultado, toque, F3
```

## Determinismo

`pista@versão + bioma + clima + seed + versão do gerador` formam a chave da corrida (`raceKey`). Recordes são guardados por essa chave, então mudar o gerador (`GENERATOR_VERSION`) ou o traçado (`version` da pista) não mistura tempos de mundos diferentes. Os testes verificam que a mesma seed reproduz o mesmo cenário e a mesma corrida.

## Física (arcade)

Os carros andam sobre a spline em coordenadas `(distância, deslocamento lateral)`. Nas curvas, uma força proporcional a `velocidade² × curvatura ÷ aderência` empurra o carro para fora; o jogador precisa virar contra ela e frear nas curvas fechadas (raio mínimo ≈ 60 m). Sair do asfalto reduz a velocidade e bater na mureta custa velocidade.

## Assets

- `public/assets/models/carro_lod.glb`: GT-R simplificado (meshoptimizer + Draco, ~1,9 MB), usado no jogo.
- `public/assets/models/carro_opt.glb`: versão original (~1,1 M triângulos), mantida como fonte.

Para regenerar o LOD:

```bash
npx @gltf-transform/cli weld public/assets/models/carro_opt.glb tmp-weld.glb
npx @gltf-transform/cli simplify tmp-weld.glb tmp-simple.glb --ratio 0.12 --error 0.0008
npx @gltf-transform/cli draco tmp-simple.glb public/assets/models/carro_lod.glb
```

## Próximos passos

- Câmera aérea e primeira seção de voo (fim do Marco 1).
- Editor de pista e mais pistas (os dados ficam em `data/tracks.ts`).
- Biomas e transições por portal.
- Garagem, desbloqueios e XP.
