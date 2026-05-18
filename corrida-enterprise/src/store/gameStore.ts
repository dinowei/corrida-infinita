import { create } from 'zustand'

interface GameState {
  boost: number
  score: number
  gameOver: boolean
  addBoost: () => void
  useBoost: () => void
  setScore: (score: number) => void
  setGameOver: (over: boolean) => void
  resetGame: () => void
}

const initialState = {
  boost: 0,
  score: 0,
  gameOver: false,
}

export const useGameStore = create<GameState>((set) => ({
  ...initialState,

  addBoost: () =>
    set((state) => ({
      boost: state.boost + 1,
    })),

  useBoost: () =>
    set((state) => ({
      boost: Math.max(0, state.boost - 1),
    })),

  setScore: (score: number) =>
    set({
      score: Math.max(0, score),
    }),

  setGameOver: (over: boolean) =>
    set({
      gameOver: over,
    }),

  resetGame: () =>
    set({
      ...initialState,
    }),
}))