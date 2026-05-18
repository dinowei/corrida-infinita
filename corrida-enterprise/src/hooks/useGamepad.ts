import { useEffect, useRef, useState } from 'react'

interface GamepadInput {
    left: boolean
    right: boolean
    accelerate: boolean
    brake: boolean
    boost: boolean
}

const INITIAL_INPUT: GamepadInput = {
    left: false,
    right: false,
    accelerate: false,
    brake: false,
    boost: false,
}

export function useGamepad(): GamepadInput {
    const [input, setInput] = useState<GamepadInput>(INITIAL_INPUT)

    const frameRef = useRef<number | null>(null)
    const keyboardRef = useRef({
        left: false,
        right: false,
        up: false,
        down: false,
        boost: false,
    })
    const lastInputRef = useRef<GamepadInput>(INITIAL_INPUT)

    useEffect(() => {
        const DEADZONE = 0.35

        const isSameInput = (a: GamepadInput, b: GamepadInput) =>
            a.left === b.left &&
            a.right === b.right &&
            a.accelerate === b.accelerate &&
            a.brake === b.brake &&
            a.boost === b.boost

        const commitInput = (next: GamepadInput) => {
            if (isSameInput(lastInputRef.current, next)) return
            lastInputRef.current = next
            setInput(next)
        }

        const getKeyboardInput = (): GamepadInput => ({
            left: keyboardRef.current.left,
            right: keyboardRef.current.right,
            accelerate: keyboardRef.current.up,
            brake: keyboardRef.current.down,
            boost: keyboardRef.current.boost,
        })

        const getGamepadInput = (): GamepadInput | null => {
            const gamepads = Array.from(navigator.getGamepads?.() ?? [])
            const gp = gamepads.find(Boolean)

            if (!gp) return null

            const leftStickX = gp.axes[0] ?? 0
            const dpadLeft = gp.buttons[14]?.pressed ?? false
            const dpadRight = gp.buttons[15]?.pressed ?? false

            const left = leftStickX < -DEADZONE || dpadLeft
            const right = leftStickX > DEADZONE || dpadRight

            return {
                left,
                right,
                accelerate: gp.buttons[7]?.pressed ?? false,
                brake: gp.buttons[6]?.pressed ?? false,
                boost: gp.buttons[0]?.pressed ?? false,
            }
        }

        const loop = () => {
            const keyboardInput = getKeyboardInput()
            const gamepadInput = getGamepadInput()

            const nextInput: GamepadInput = {
                left: keyboardInput.left || gamepadInput?.left || false,
                right: keyboardInput.right || gamepadInput?.right || false,
                accelerate: keyboardInput.accelerate || gamepadInput?.accelerate || false,
                brake: keyboardInput.brake || gamepadInput?.brake || false,
                boost: keyboardInput.boost || gamepadInput?.boost || false,
            }

            commitInput(nextInput)
            frameRef.current = requestAnimationFrame(loop)
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            switch (event.code) {
                case 'ArrowLeft':
                case 'KeyA':
                    keyboardRef.current.left = true
                    break
                case 'ArrowRight':
                case 'KeyD':
                    keyboardRef.current.right = true
                    break
                case 'ArrowUp':
                case 'KeyW':
                    keyboardRef.current.up = true
                    break
                case 'ArrowDown':
                case 'KeyS':
                    keyboardRef.current.down = true
                    break
                case 'Space':
                    keyboardRef.current.boost = true
                    break
                default:
                    return
            }
        }

        const handleKeyUp = (event: KeyboardEvent) => {
            switch (event.code) {
                case 'ArrowLeft':
                case 'KeyA':
                    keyboardRef.current.left = false
                    break
                case 'ArrowRight':
                case 'KeyD':
                    keyboardRef.current.right = false
                    break
                case 'ArrowUp':
                case 'KeyW':
                    keyboardRef.current.up = false
                    break
                case 'ArrowDown':
                case 'KeyS':
                    keyboardRef.current.down = false
                    break
                case 'Space':
                    keyboardRef.current.boost = false
                    break
                default:
                    return
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keyup', handleKeyUp)

        frameRef.current = requestAnimationFrame(loop)

        return () => {
            if (frameRef.current !== null) {
                cancelAnimationFrame(frameRef.current)
            }
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
        }
    }, [])

    return input
}