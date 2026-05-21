"use client"

import { useRef, useState } from "react"
import { useFrame } from "@react-three/fiber"
import { Float, Text } from "@react-three/drei"
import * as THREE from "three"
import type { Group, Mesh } from "three"
import type { GlcBookConfig } from "./types"

type Props = {
  book: GlcBookConfig
  earned: boolean
  /** Stagger the idle sway phase so badges don't all bob in sync */
  phaseOffset?: number
}

const LOCKED_DISC = "#4A4A4A"
const LOCKED_RING = "#666666"
const LOCKED_EMISSIVE = "#111111"

// Disc face geometry shared across all instances
const DISC_RADIUS = 1
const DISC_DEPTH = 0.14
const RING_TUBE = 0.055

export function GlcBookBadge({ book, earned, phaseOffset = 0 }: Props) {
  const groupRef = useRef<Group>(null)
  const hitRef = useRef<Mesh>(null)
  const [hovered, setHovered] = useState(false)

  const discColor = earned ? book.color : LOCKED_DISC
  const ringColor = earned ? book.ringColor : LOCKED_RING
  const emissiveColor = earned ? book.emissive : LOCKED_EMISSIVE
  const emissiveIntensity = earned ? 0.45 : 0.05
  const opacity = earned ? 1 : 0.55
  const metalness = earned ? 0.82 : 0.25
  const roughness = earned ? 0.12 : 0.65
  const textColor = earned ? "#ffffff" : "#888888"
  const subtitleColor = earned ? "rgba(255,255,255,0.75)" : "rgba(130,130,130,0.6)"
  const glcColor = earned ? "rgba(255,255,255,0.45)" : "rgba(110,110,110,0.4)"

  useFrame((state, delta) => {
    if (!groupRef.current) return

    if (hovered) {
      // Spin on hover
      groupRef.current.rotation.y += delta * 2.8
    } else {
      // Gentle idle sway — lerp toward a sine wave so it settles smoothly
      const targetY = Math.sin(state.clock.elapsedTime * 0.4 + phaseOffset) * 0.14
      groupRef.current.rotation.y += (targetY - groupRef.current.rotation.y) * 0.04
    }

    // Smooth scale spring on hover
    const targetScale = hovered ? 1.09 : 1.0
    const s = THREE.MathUtils.lerp(groupRef.current.scale.x, targetScale, 0.1)
    groupRef.current.scale.setScalar(s)
  })

  return (
    <Float speed={1.4} rotationIntensity={0.06} floatIntensity={0.28}>
      <group ref={groupRef}>
        {/* Main medal disc — rotated so flat face looks at camera (+Z) */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[DISC_RADIUS, DISC_RADIUS, DISC_DEPTH, 64]} />
          <meshStandardMaterial
            color={discColor}
            emissive={emissiveColor}
            emissiveIntensity={emissiveIntensity}
            metalness={metalness}
            roughness={roughness}
            transparent
            opacity={opacity}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* Outer metallic ring */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[DISC_RADIUS, RING_TUBE, 8, 80]} />
          <meshStandardMaterial
            color={ringColor}
            emissive={ringColor}
            emissiveIntensity={earned ? 0.18 : 0}
            metalness={0.94}
            roughness={0.07}
            transparent
            opacity={opacity}
          />
        </mesh>

        {/* Invisible oversized hit disc — catches pointer events reliably */}
        <mesh
          ref={hitRef}
          rotation={[Math.PI / 2, 0, 0]}
          onPointerEnter={() => {
            setHovered(true)
            document.body.style.cursor = "pointer"
          }}
          onPointerLeave={() => {
            setHovered(false)
            document.body.style.cursor = "default"
          }}
        >
          <cylinderGeometry args={[1.1, 1.1, 0.01, 32]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>

        {/* Book number — large, centered, slightly above middle */}
        <Text
          position={[0, 0.1, 0.08]}
          fontSize={0.64}
          color={textColor}
          anchorX="center"
          anchorY="middle"
        >
          {String(book.number)}
        </Text>

        {/* Book title — below the number */}
        <Text
          position={[0, -0.44, 0.08]}
          fontSize={0.112}
          color={subtitleColor}
          anchorX="center"
          anchorY="middle"
          maxWidth={1.65}
          textAlign="center"
        >
          {book.title}
        </Text>

        {/* GLC label — bottom of face */}
        <Text
          position={[0, -0.72, 0.08]}
          fontSize={0.082}
          color={glcColor}
          anchorX="center"
          anchorY="middle"
          letterSpacing={0.05}
        >
          GLC · LEVEL 1
        </Text>
      </group>
    </Float>
  )
}
