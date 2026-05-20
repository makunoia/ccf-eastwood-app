"use client"

import { useEffect } from "react"

export function PreventInputZoom() {
  useEffect(() => {
    const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
    if (!viewport) return

    const saved = viewport.content

    function onFocusIn(e: FocusEvent) {
      const tag = (e.target as Element)?.tagName?.toLowerCase()
      if (tag !== "input" && tag !== "textarea" && tag !== "select") return
      viewport!.content = saved.includes("maximum-scale")
        ? saved.replace(/maximum-scale=[^,]+/, "maximum-scale=1")
        : saved + ", maximum-scale=1"
    }

    function onFocusOut() {
      viewport!.content = saved
    }

    document.addEventListener("focusin", onFocusIn, true)
    document.addEventListener("focusout", onFocusOut, true)

    return () => {
      document.removeEventListener("focusin", onFocusIn, true)
      document.removeEventListener("focusout", onFocusOut, true)
    }
  }, [])

  return null
}
