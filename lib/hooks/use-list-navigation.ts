"use client"

import { useMemo } from "react"

type Nav = { prev: string | null; next: string | null }

export function useListNavigation(currentId: string, storageKey: string): Nav {
  return useMemo<Nav>(() => {
    try {
      const stored = sessionStorage.getItem(storageKey)
      if (!stored) return { prev: null, next: null }
      const ids: string[] = JSON.parse(stored)
      const i = ids.indexOf(currentId)
      if (i === -1) return { prev: null, next: null }
      return {
        prev: i > 0 ? ids[i - 1] : null,
        next: i < ids.length - 1 ? ids[i + 1] : null,
      }
    } catch {
      return { prev: null, next: null }
    }
  }, [currentId, storageKey])
}
