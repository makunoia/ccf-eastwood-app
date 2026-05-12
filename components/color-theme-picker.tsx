"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { deriveGradient, deriveBackgroundTint } from "@/lib/color-utils"

export type ColorTheme = {
  primary: string
  secondary: string
  accent: string
}

const DEFAULT_THEME: ColorTheme = {
  primary: "#4F46E5",
  secondary: "#7C3AED",
  accent: "#EC4899",
}

const DEFAULT_SIDEBAR_GRADIENT = "linear-gradient(175deg, oklch(0.36 0.14 222) 0%, oklch(0.22 0.12 215) 100%)"

function isValidHex(v: string) {
  return /^#[0-9A-Fa-f]{6}$/.test(v)
}

// ─── Mini live preview ─────────────────────────────────────────────────────────

function BrandPreview({ primary, secondary, accent }: ColorTheme) {
  const sidebarBg = isValidHex(primary) ? deriveGradient(primary) : DEFAULT_SIDEBAR_GRADIENT
  const pageBg = isValidHex(secondary) ? deriveBackgroundTint(secondary) : null
  const accentColor = isValidHex(accent) ? accent : null

  const navItems = [
    { active: true, width: "72%" },
    { active: false, width: "62%" },
    { active: false, width: "68%" },
    { active: false, width: "50%" },
  ]

  return (
    <div
      className="flex h-24 overflow-hidden rounded-xl border gap-1.5 p-1.5"
      style={pageBg ? { backgroundColor: pageBg } : { backgroundColor: "oklch(0.22 0.13 218)" }}
      aria-hidden
    >
      {/* Mini sidebar */}
      <div
        className="shrink-0 w-22 rounded-lg flex flex-col gap-1.5 px-2 pt-2.5 pb-2"
        style={{ background: sidebarBg }}
      >
        <div className="size-5 rounded bg-white/20 mx-auto mb-1" />
        {navItems.map((item, i) => (
          <div
            key={i}
            className="h-1.5 rounded-full"
            style={{
              backgroundColor: item.active
                ? accentColor
                  ? `${accentColor}cc`
                  : "rgba(255,255,255,0.55)"
                : "rgba(255,255,255,0.22)",
              width: item.width,
            }}
          />
        ))}
      </div>
      {/* Mini content panel (white inset) */}
      <div className="flex-1 rounded-lg bg-background p-2.5 space-y-1.5">
        <div className="h-2 w-16 rounded bg-foreground/15" />
        <div className="h-2 w-24 rounded bg-foreground/10" />
        <div className="h-2 w-12 rounded bg-foreground/10" />
        <div className="mt-2 h-5 w-full rounded-md bg-foreground/5 border border-foreground/8" />
      </div>
    </div>
  )
}

// ─── Single color row ──────────────────────────────────────────────────────────

type ColorRowProps = {
  label: string
  description: string
  value: string
  onChange: (v: string) => void
  preview?: React.ReactNode
}

function ColorRow({ label, description, value, onChange, preview }: ColorRowProps) {
  function handleText(v: string) {
    if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) onChange(v)
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-none">{label}</p>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {preview}
        {/* Native color picker */}
        <div className="relative size-8 shrink-0 rounded-md border overflow-hidden cursor-pointer">
          <input
            type="color"
            value={isValidHex(value) ? value : "#4F46E5"}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 size-full opacity-0 cursor-pointer"
          />
          <div
            className="size-full rounded-md"
            style={{ backgroundColor: isValidHex(value) ? value : "#e2e8f0" }}
          />
        </div>
        <Input
          value={value}
          onChange={(e) => handleText(e.target.value)}
          placeholder="#000000"
          className="h-8 w-24 font-mono text-sm"
          maxLength={7}
        />
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

type Props = {
  value: ColorTheme
  onChange: (theme: ColorTheme) => void
  label?: string
}

export function ColorThemePicker({ value, onChange, label = "Color Theme" }: Props) {
  function set(key: keyof ColorTheme, v: string) {
    onChange({ ...value, [key]: v })
  }

  const sidebarGradient = isValidHex(value.primary)
    ? deriveGradient(value.primary)
    : DEFAULT_SIDEBAR_GRADIENT

  const pageBg = isValidHex(value.secondary) ? deriveBackgroundTint(value.secondary) : null

  return (
    <div className="space-y-3">
      <Label>{label}</Label>

      <BrandPreview
        primary={value.primary}
        secondary={value.secondary}
        accent={value.accent}
      />

      <div className="space-y-4 rounded-lg border p-4">
        <ColorRow
          label="Sidebar"
          description="Background gradient of the navigation sidebar"
          value={value.primary}
          onChange={(v) => set("primary", v)}
          preview={
            <div
              className="h-7 w-10 shrink-0 rounded border"
              style={{ background: sidebarGradient }}
            />
          }
        />

        <div className="border-t" />

        <ColorRow
          label="Background"
          description="Outer background frame around the sidebar and content"
          value={value.secondary}
          onChange={(v) => set("secondary", v)}
          preview={
            <div
              className="h-7 w-10 shrink-0 rounded border bg-background"
              style={pageBg ? { backgroundColor: pageBg } : undefined}
            />
          }
        />

        <div className="border-t" />

        <ColorRow
          label="Active Items"
          description="Highlight color for the active navigation item"
          value={value.accent}
          onChange={(v) => set("accent", v)}
          preview={
            <div
              className="h-7 w-10 shrink-0 rounded border flex items-center justify-center"
              style={{ backgroundColor: isValidHex(value.accent) ? `${value.accent}22` : undefined }}
            >
              {isValidHex(value.accent) && (
                <div className="h-1.5 w-6 rounded-full" style={{ backgroundColor: value.accent }} />
              )}
            </div>
          }
        />
      </div>
    </div>
  )
}

export { DEFAULT_THEME }
