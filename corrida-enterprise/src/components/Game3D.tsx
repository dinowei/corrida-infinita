import { Canvas } from '@react-three/fiber'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { useGameStore } from '../store/gameStore'
import { useGamepad } from '../hooks/useGamepad'
import { Car } from './Car'
import { Road } from './Road'
import { useEffect, useMemo, useRef, useState } from 'react'

export function Game3D() {
    const { boost, setScore, gameOver, useBoost } = useGameStore()
    const input = useGamepad()

    const [carX, setCarX] = useState(0)
    const [scoreAcc, setScoreAcc] = useState(0)
    const [boostUntil, setBoostUntil] = useState(0)

    const boostTimeoutRef = useRef<number | null>(null)
    const boostPressedRef = useRef(false)

    const MAX_LANE_OFFSET = 1.5
    const LATERAL_STEP = 0.12
    const BASE_SPEED = 5
    const SCORE_PER_SEGMENT = 10
    const BOOST_DURATION_MS = 1000
    const BOOST_MULTIPLIER = 2

    const speed = useMemo(() => {
        return BASE_SPEED + Math.floor(scoreAcc / 100)
    }, [scoreAcc])

    const isBoostActive = boostUntil > Date.now()
    const actualSpeed = speed * (isBoostActive ? BOOST_MULTIPLIER : 1)

    useEffect(() => {
        if (gameOver) return

        let direction = 0
        if (input.left) direction -= 1
        if (input.right) direction += 1

        if (direction === 0) return

        setCarX((prev) => {
            const next = prev + direction * LATERAL_STEP
            return Math.min(MAX_LANE_OFFSET, Math.max(-MAX_LANE_OFFSET, next))
        })
    }, [input.left, input.right, gameOver])

    useEffect(() => {
        if (gameOver) return

        const boostJustPressed = input.boost && !boostPressedRef.current
        boostPressedRef.current = input.boost

        if (!boostJustPressed) return
        if (boost <= 0) return

        useBoost()

        const nextBoostUntil = Date.now() + BOOST_DURATION_MS
        setBoostUntil(nextBoostUntil)

        if (boostTimeoutRef.current !== null) {
            window.clearTimeout(boostTimeoutRef.current)
        }

        boostTimeoutRef.current = window.setTimeout(() => {
            setBoostUntil(0)
            boostTimeoutRef.current = null
        }, BOOST_DURATION_MS)

        return () => {
            if (boostTimeoutRef.current !== null) {
                window.clearTimeout(boostTimeoutRef.current)
            }
        }
    }, [input.boost, boost, gameOver, useBoost])

    useEffect(() => {
        return () => {
            if (boostTimeoutRef.current !== null) {
                window.clearTimeout(boostTimeoutRef.current)
            }
        }
    }, [])

    const handlePassSegment = () => {
        if (gameOver) return

        setScoreAcc((prev) => {
            const next = prev + SCORE_PER_SEGMENT
            setScore(next)
            return next
        })
    }

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
            }}
        >
            <Canvas
                camera={{ position: [0, 2, 5], fov: 75 }}
                shadows
                dpr={[1, 1.5]}
                gl={{ antialias: true, powerPreference: 'high-performance' }}
            >
                <ambientLight intensity={0.45} />
                <directionalLight
                    position={[5, 10, 5]}
                    intensity={1.1}
                    castShadow
                    shadow-mapSize-width={1024}
                    shadow-mapSize-height={1024}
                />
                <pointLight position={[0, 3, 2]} intensity={0.45} color="#ff6a00" />
                <pointLight position={[0, 2, -4]} intensity={0.18} color="#00e0ff" />

                <Road speed={actualSpeed} onPassSegment={handlePassSegment} />
                <Car positionX={carX} />

                <EffectComposer>
                    <Bloom
                        intensity={0.75}
                        luminanceThreshold={0.16}
                        luminanceSmoothing={0.42}
                    />
                </EffectComposer>
            </Canvas>
        </div>
    )
}