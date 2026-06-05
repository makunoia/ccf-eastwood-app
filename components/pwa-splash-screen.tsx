"use client"

import { useEffect, useState } from "react"
import Image from "next/image"

export function PwaSplashScreen() {
  const [phase, setPhase] = useState<"hidden" | "visible" | "fading">("hidden")

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true

    if (!isStandalone) return

    const shown = sessionStorage.getItem("pwa-splash-shown")
    if (shown) return

    sessionStorage.setItem("pwa-splash-shown", "1")
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhase("visible")

    const fadeTimer = setTimeout(() => setPhase("fading"), 1200)
    const hideTimer = setTimeout(() => setPhase("hidden"), 1600)

    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(hideTimer)
    }
  }, [])

  if (phase === "hidden") return null

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{
        backgroundColor: "#18181b",
        opacity: phase === "fading" ? 0 : 1,
        transition: phase === "fading" ? "opacity 0.4s ease-out" : undefined,
      }}
    >
      <Image
        src="/ccf-logo.png"
        alt="CCF Eastwood"
        width={140}
        height={140}
        priority
        className="object-contain"
      />
    </div>
  )
}
