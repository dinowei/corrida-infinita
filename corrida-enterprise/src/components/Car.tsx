import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, MathUtils } from 'three'

interface CarProps {
    positionX: number
}

export function Car({ positionX }: CarProps) {
    const carRef = useRef<Group>(null)
    const frontLeftWheelRef = useRef<Group>(null)
    const frontRightWheelRef = useRef<Group>(null)
    const rearLeftWheelRef = useRef<Group>(null)
    const rearRightWheelRef = useRef<Group>(null)

    const config = useMemo(
        () => ({
            followSmoothness: 14,
            tiltSmoothness: 10,
            maxTiltZ: 0.16,
            maxTurnY: 0.1,
            tiltStrength: 1.8,
            wheelSpinSpeed: 10,
            hoverBobAmplitude: 0.012,
            hoverBobSpeed: 2.2,
            baseY: 0.22,
        }),
        []
    )

    useFrame((state, delta) => {
        const car = carRef.current
        if (!car) return

        const previousX = car.position.x

        car.position.x = MathUtils.damp(
            car.position.x,
            positionX,
            config.followSmoothness,
            delta
        )

        const movementX = car.position.x - previousX
        const targetTiltZ = MathUtils.clamp(
            -movementX * config.tiltStrength * 10,
            -config.maxTiltZ,
            config.maxTiltZ
        )

        const targetTurnY = MathUtils.clamp(
            -movementX * 6,
            -config.maxTurnY,
            config.maxTurnY
        )

        car.rotation.z = MathUtils.damp(
            car.rotation.z,
            targetTiltZ,
            config.tiltSmoothness,
            delta
        )

        car.rotation.y = MathUtils.damp(
            car.rotation.y,
            targetTurnY,
            config.tiltSmoothness,
            delta
        )

        car.position.y =
            config.baseY + Math.sin(state.clock.elapsedTime * config.hoverBobSpeed) * config.hoverBobAmplitude

        const wheelSpin = delta * config.wheelSpinSpeed * (1 + Math.abs(movementX) * 8)

        if (frontLeftWheelRef.current) frontLeftWheelRef.current.rotation.x -= wheelSpin
        if (frontRightWheelRef.current) frontRightWheelRef.current.rotation.x -= wheelSpin
        if (rearLeftWheelRef.current) rearLeftWheelRef.current.rotation.x -= wheelSpin
        if (rearRightWheelRef.current) rearRightWheelRef.current.rotation.x -= wheelSpin
    })

    return (
        <group ref={carRef} position={[0, config.baseY, 0]}>
            {/* CHASSIS */}
            <mesh castShadow receiveShadow>
                <boxGeometry args={[0.82, 0.28, 1.65]} />
                <meshStandardMaterial
                    color="#ff5a1f"
                    metalness={0.82}
                    roughness={0.22}
                />
            </mesh>

            {/* CABIN */}
            <mesh position={[0, 0.24, -0.03]} castShadow receiveShadow>
                <boxGeometry args={[0.68, 0.22, 0.98]} />
                <meshStandardMaterial
                    color="#0f1115"
                    metalness={0.95}
                    roughness={0.18}
                />
            </mesh>

            {/* HOOD DETAIL */}
            <mesh position={[0, 0.08, 0.48]} castShadow receiveShadow>
                <boxGeometry args={[0.74, 0.08, 0.45]} />
                <meshStandardMaterial
                    color="#ff6a2f"
                    metalness={0.78}
                    roughness={0.2}
                />
            </mesh>

            {/* FRONT BUMPER */}
            <mesh position={[0, -0.03, 0.84]} castShadow receiveShadow>
                <boxGeometry args={[0.78, 0.1, 0.08]} />
                <meshStandardMaterial
                    color="#16181d"
                    metalness={0.55}
                    roughness={0.4}
                />
            </mesh>

            {/* REAR BUMPER */}
            <mesh position={[0, -0.03, -0.84]} castShadow receiveShadow>
                <boxGeometry args={[0.78, 0.1, 0.08]} />
                <meshStandardMaterial
                    color="#16181d"
                    metalness={0.55}
                    roughness={0.4}
                />
            </mesh>

            {/* WINDSHIELD / GLASS */}
            <mesh position={[0, 0.29, 0.1]} castShadow receiveShadow>
                <boxGeometry args={[0.62, 0.12, 0.42]} />
                <meshStandardMaterial
                    color="#7fb3ff"
                    metalness={0.95}
                    roughness={0.05}
                    transparent
                    opacity={0.45}
                />
            </mesh>

            {/* WHEELS */}
            <group ref={frontLeftWheelRef} position={[-0.45, -0.14, 0.53]}>
                <mesh castShadow receiveShadow rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[0.2, 0.2, 0.18, 24]} />
                    <meshStandardMaterial color="#1f1f1f" metalness={0.2} roughness={0.9} />
                </mesh>
            </group>

            <group ref={frontRightWheelRef} position={[0.45, -0.14, 0.53]}>
                <mesh castShadow receiveShadow rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[0.2, 0.2, 0.18, 24]} />
                    <meshStandardMaterial color="#1f1f1f" metalness={0.2} roughness={0.9} />
                </mesh>
            </group>

            <group ref={rearLeftWheelRef} position={[-0.45, -0.14, -0.53]}>
                <mesh castShadow receiveShadow rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[0.2, 0.2, 0.18, 24]} />
                    <meshStandardMaterial color="#1f1f1f" metalness={0.2} roughness={0.9} />
                </mesh>
            </group>

            <group ref={rearRightWheelRef} position={[0.45, -0.14, -0.53]}>
                <mesh castShadow receiveShadow rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[0.2, 0.2, 0.18, 24]} />
                    <meshStandardMaterial color="#1f1f1f" metalness={0.2} roughness={0.9} />
                </mesh>
            </group>

            {/* HEADLIGHTS */}
            <mesh position={[0.28, 0.06, 0.87]} castShadow>
                <sphereGeometry args={[0.055, 16, 16]} />
                <meshStandardMaterial
                    color="#ffd27a"
                    emissive="#ff9500"
                    emissiveIntensity={1.4}
                />
            </mesh>

            <mesh position={[-0.28, 0.06, 0.87]} castShadow>
                <sphereGeometry args={[0.055, 16, 16]} />
                <meshStandardMaterial
                    color="#ffd27a"
                    emissive="#ff9500"
                    emissiveIntensity={1.4}
                />
            </mesh>

            {/* TAILLIGHTS */}
            <mesh position={[0.28, 0.05, -0.87]} castShadow>
                <boxGeometry args={[0.09, 0.05, 0.04]} />
                <meshStandardMaterial
                    color="#ff3b30"
                    emissive="#ff3b30"
                    emissiveIntensity={1}
                />
            </mesh>

            <mesh position={[-0.28, 0.05, -0.87]} castShadow>
                <boxGeometry args={[0.09, 0.05, 0.04]} />
                <meshStandardMaterial
                    color="#ff3b30"
                    emissive="#ff3b30"
                    emissiveIntensity={1}
                />
            </mesh>
        </group>
    )
}