import { StrictMode, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

type GamepadStatusDetail = {
  connected: boolean
  gamepads: (Gamepad | null)[]
}

function Root() {
  const initializedRef = useRef(false)

  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    let animationId: number | null = null
    let pollingActive = false

    const emitGamepadStatus = () => {
      const gamepads = Array.from(navigator.getGamepads?.() ?? [])
      const connected = gamepads.some(Boolean)

      window.dispatchEvent(
        new CustomEvent<GamepadStatusDetail>('gamepad-status', {
          detail: { connected, gamepads },
        })
      )

      return connected
    }

    const pollGamepads = () => {
      if (!pollingActive) return

      emitGamepadStatus()
      animationId = window.requestAnimationFrame(pollGamepads)
    }

    const startPolling = () => {
      if (pollingActive) return
      pollingActive = true
      animationId = window.requestAnimationFrame(pollGamepads)
    }

    const stopPolling = () => {
      pollingActive = false
      if (animationId !== null) {
        window.cancelAnimationFrame(animationId)
        animationId = null
      }
    }

    const setupTVDisplay = () => {
      let viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')

      if (!viewport) {
        viewport = document.createElement('meta')
        viewport.name = 'viewport'
        document.head.appendChild(viewport)
      }

      viewport.setAttribute(
        'content',
        'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'
      )

      const ua = navigator.userAgent.toLowerCase()
      const isConsole = /playstation|xbox/.test(ua)

      document.documentElement.classList.remove('console', 'ps5', 'xbox-series')

      if (isConsole) {
        document.documentElement.classList.add('console')
        if (ua.includes('playstation')) {
          document.documentElement.classList.add('ps5')
        }
        if (ua.includes('xbox')) {
          document.documentElement.classList.add('xbox-series')
        }
      }
    }

    const handleGamepadConnected = (event: GamepadEvent) => {
      window.dispatchEvent(
        new CustomEvent('gamepad-connected', {
          detail: event.gamepad,
        })
      )

      emitGamepadStatus()
      startPolling()
    }

    const handleGamepadDisconnected = (event: GamepadEvent) => {
      window.dispatchEvent(
        new CustomEvent('gamepad-disconnected', {
          detail: event.gamepad,
        })
      )

      const stillConnected = emitGamepadStatus()
      if (!stillConnected) {
        stopPolling()
      }
    }

    const toggleFullscreen = async () => {
      try {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen()
        } else {
          await document.exitFullscreen()
        }
      } catch {
        // browsers can block fullscreen without valid user gesture
      }
    }

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.code === 'KeyF') {
        void toggleFullscreen()
      }
    }

    const removeInitialLoader = () => {
      const loader = document.getElementById('initial-loader')
      if (loader) {
        loader.style.opacity = '0'
        loader.style.pointerEvents = 'none'
        window.setTimeout(() => {
          loader.remove()
        }, 250)
      }
    }

    setupTVDisplay()
    removeInitialLoader()

    window.addEventListener('gamepadconnected', handleGamepadConnected)
    window.addEventListener('gamepaddisconnected', handleGamepadDisconnected)
    window.addEventListener('keydown', handleKeydown)

    const hasGamepadOnBoot = emitGamepadStatus()
    if (hasGamepadOnBoot) {
      startPolling()
    }

    return () => {
      stopPolling()
      window.removeEventListener('gamepadconnected', handleGamepadConnected)
      window.removeEventListener('gamepaddisconnected', handleGamepadDisconnected)
      window.removeEventListener('keydown', handleKeydown)
    }
  }, [])

  return <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>
)