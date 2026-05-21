"use client"

import { Canvas } from "@react-three/fiber"
import { GlcBookBadge } from "./glc-book-badge"
import { GLC_BOOKS } from "./types"
import type { GlcBookNumber } from "./types"

type Props = {
  earned: Partial<Record<GlcBookNumber, boolean>>
}

/**
 * Renders all 4 GLC Level 1 badges in a 2×2 grid on mobile and
 * a 4-column row on wider screens. Each badge gets its own Canvas
 * (one WebGL context each — 4 total, well within the browser cap of 8–16).
 */
export function GlcBadgeRow({ earned }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
      {([1, 2, 3, 4] as GlcBookNumber[]).map((n, i) => (
        <div key={n} className="flex flex-col items-center gap-1">
          {/* Square canvas — camera at z=2.9 fills the badge neatly */}
          <div className="aspect-square w-full">
            <Canvas
              camera={{ position: [0, 0, 2.9], fov: 48 }}
              dpr={[1, 2]}
              gl={{ antialias: true, alpha: true }}
              style={{ background: "transparent" }}
            >
              {/* Key light — warm white from above-right */}
              <pointLight position={[2, 2.5, 4]} intensity={3.5} color="#ffffff" />
              {/* Fill light — cool blue from lower-left */}
              <pointLight position={[-2, -1.5, 3]} intensity={1.2} color="#aac8ff" />
              {/* Ambient for shadow fill */}
              <ambientLight intensity={0.45} />

              <GlcBookBadge
                book={GLC_BOOKS[n]}
                earned={earned[n] ?? false}
                phaseOffset={i * 1.3}
              />
            </Canvas>
          </div>

          {/* Status label below each badge */}
          <span
            className={
              (earned[n]
                ? "text-foreground font-medium"
                : "text-muted-foreground") +
              " text-xs text-center leading-tight"
            }
          >
            {earned[n] ? "Completed" : "Locked"}
          </span>
        </div>
      ))}
    </div>
  )
}
