import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const SEGMENT_LENGTH = 4
const VISIBLE_SEGMENTS = 20
const ROAD_WIDTH = 3
const SHOULDER_OFFSET = 1.4

interface RoadProps {
    speed: number
    onPassSegment: () => void
}

type RoadSegment = {
    id: number
    group: THREE.Group
}

export function Road({ speed, onPassSegment }: RoadProps) {
    const segmentsRef = useRef<RoadSegment[]>([])
    const distanceAccumulatorRef = useRef(0)

    const assets = useMemo(() => {
        const roadGeometry = new THREE.PlaneGeometry(ROAD_WIDTH, SEGMENT_LENGTH)
        const laneGeometry = new THREE.BoxGeometry(0.1, 0.05, SEGMENT_LENGTH)

        const roadMaterial = new THREE.MeshStandardMaterial({
            color: 0x222222,
            side: THREE.DoubleSide,
            roughness: 0.78,
            metalness: 0.08,
        })

        const laneMaterial = new THREE.MeshStandardMaterial({
            color: 0xffaa00,
            emissive: 0xaa4400,
            emissiveIntensity: 0.2,
            roughness: 0.55,
            metalness: 0.18,
        })

        return {
            roadGeometry,
            laneGeometry,
            roadMaterial,
            laneMaterial,
        }
    }, [])

    const initialSegments = useMemo(() => {
        const items: RoadSegment[] = []

        for (let i = 0; i < VISIBLE_SEGMENTS; i++) {
            const segmentGroup = new THREE.Group()
            segmentGroup.position.z = -i * SEGMENT_LENGTH

            const roadPiece = new THREE.Mesh(assets.roadGeometry, assets.roadMaterial)
            roadPiece.rotation.x = -Math.PI / 2
            roadPiece.receiveShadow = true

            const leftLine = new THREE.Mesh(assets.laneGeometry, assets.laneMaterial)
            leftLine.position.set(-SHOULDER_OFFSET, 0.05, 0)
            leftLine.castShadow = false
            leftLine.receiveShadow = true

            const rightLine = new THREE.Mesh(assets.laneGeometry, assets.laneMaterial)
            rightLine.position.set(SHOULDER_OFFSET, 0.05, 0)
            rightLine.castShadow = false
            rightLine.receiveShadow = true

            segmentGroup.add(roadPiece, leftLine, rightLine)

            items.push({
                id: i,
                group: segmentGroup,
            })
        }

        return items
    }, [assets])

    if (segmentsRef.current.length === 0) {
        segmentsRef.current = initialSegments
    }

    useFrame((_, delta) => {
        const moveZ = speed * delta
        distanceAccumulatorRef.current += moveZ

        for (const segment of segmentsRef.current) {
            segment.group.position.z += moveZ
        }

        while (distanceAccumulatorRef.current >= SEGMENT_LENGTH) {
            distanceAccumulatorRef.current -= SEGMENT_LENGTH
            onPassSegment()

            const firstSegment = segmentsRef.current.shift()
            const lastSegment = segmentsRef.current[segmentsRef.current.length - 1]

            if (!firstSegment || !lastSegment) break

            firstSegment.group.position.z = lastSegment.group.position.z - SEGMENT_LENGTH
            segmentsRef.current.push(firstSegment)
        }
    })

    useEffect(() => {
        return () => {
            for (const segment of segmentsRef.current) {
                segment.group.clear()
            }

            assets.roadGeometry.dispose()
            assets.laneGeometry.dispose()
            assets.roadMaterial.dispose()
            assets.laneMaterial.dispose()
        }
    }, [assets])

    return (
        <group>
            {segmentsRef.current.map((segment) => (
                <primitive key={segment.id} object={segment.group} />
            ))}
        </group>
    )
}