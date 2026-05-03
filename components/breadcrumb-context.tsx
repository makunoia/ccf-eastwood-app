"use client"

import React, { createContext, useCallback, useContext, useEffect, useState } from "react"

type BreadcrumbOverrides = Record<string, string>

type BreadcrumbContextValue = {
  overrides: BreadcrumbOverrides
  setOverride: (href: string, label: string) => void
  clearOverride: (href: string) => void
}

const BreadcrumbContext = createContext<BreadcrumbContextValue>({
  overrides: {},
  setOverride: () => {},
  clearOverride: () => {},
})

export function BreadcrumbProvider({ children }: { children: React.ReactNode }) {
  const [overrides, setOverrides] = useState<BreadcrumbOverrides>({})

  const setOverride = useCallback((href: string, label: string) => {
    setOverrides((prev) => ({ ...prev, [href]: label }))
  }, [])

  const clearOverride = useCallback((href: string) => {
    setOverrides((prev) => {
      const next = { ...prev }
      delete next[href]
      return next
    })
  }, [])

  return (
    <BreadcrumbContext.Provider value={{ overrides, setOverride, clearOverride }}>
      {children}
    </BreadcrumbContext.Provider>
  )
}

export function useBreadcrumbContext() {
  return useContext(BreadcrumbContext)
}

export function BreadcrumbOverride({ href, label }: { href: string; label: string }) {
  const { setOverride, clearOverride } = useBreadcrumbContext()

  useEffect(() => {
    setOverride(href, label)
    return () => clearOverride(href)
  }, [href, label, setOverride, clearOverride])

  return null
}
