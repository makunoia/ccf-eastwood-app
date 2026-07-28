"use client"

import * as React from "react"
import { IconLock } from "@tabler/icons-react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { MODULE_META } from "@/components/module-meta"
import {
  availableModules,
  blockingDependents,
  formatModuleList,
  modulesToEnable,
  MODULE_LABELS,
  MODULE_REQUIRES,
} from "@/lib/events/modules"
import type { EventModuleType, EventType } from "@/app/generated/prisma/client"

/**
 * The event's modules, as one divided list rather than a stack of cards.
 *
 * Six modules sharing an icon, a title, a sentence and a switch is precisely the
 * identical-card-grid the design system rules out — repeated card chrome adds six
 * borders and no information. A single container with hairline-divided rows scans
 * top-to-bottom in one pass, which is how someone actually reads a settings list.
 *
 * Every row is a three-column grid: icon, text, control. Anything a row expands
 * into (a price field, the bus list, a dependency note) is placed in the same text
 * column via `col-start-2`, so it lines up with the module's name structurally
 * instead of by a padding value that drifts the moment an icon size changes.
 *
 * Shared by the create-event picker and Event Settings → Modules so the same switch
 * reads identically in both, per the consistent-vocabulary rule.
 */

/** Modules something else depends on, derived so the grouping can't go stale. */
function isFoundation(type: EventModuleType): boolean {
  return Object.values(MODULE_REQUIRES).some((requires) => requires.includes(type))
}

export type ModuleRowState = {
  type: EventModuleType
  /** Rendered inside the row's text column when the module is on. */
  children?: React.ReactNode
}

function ModuleRow({
  type,
  enabled,
  selected,
  busy,
  onToggle,
  children,
}: {
  type: EventModuleType
  /** Every currently-on module — drives the dependency messaging. */
  enabled: EventModuleType[]
  selected: boolean
  busy: boolean
  onToggle: (type: EventModuleType) => void
  children?: React.ReactNode
}) {
  const meta = MODULE_META[type]
  const Icon = meta.icon
  const label = MODULE_LABELS[type]

  // A module can't be switched off while something that needs it is still on.
  const blockers = selected ? blockingDependents(type, enabled) : []
  const requirements = !selected
    ? modulesToEnable(type, enabled).filter((m) => m !== type)
    : []
  const locked = blockers.length > 0

  const noteId = `module-${type}-note`
  const note = locked
    ? `Required by ${formatModuleList(blockers)}. Turn ${
        blockers.length > 1 ? "those" : "that"
      } off first.`
    : requirements.length > 0
      ? `Also enables ${formatModuleList(requirements)}.`
      : null

  return (
    <div
      className={cn(
        "grid grid-cols-[auto_1fr_auto] items-start gap-x-3 gap-y-2 px-4 py-3.5 transition-colors",
        // The row is a hit target for the switch, so it reacts to the pointer.
        !locked && "hover:bg-muted/40"
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          "mt-px size-4.5 shrink-0 transition-colors",
          selected ? "text-foreground" : "text-muted-foreground/70"
        )}
      />

      <div className="min-w-0">
        <label
          htmlFor={`module-${type}`}
          className={cn(
            "flex w-fit items-center gap-1.5 text-sm font-medium leading-5",
            locked ? "cursor-default" : "cursor-pointer"
          )}
        >
          {label}
          {locked && (
            <IconLock aria-hidden className="size-3.5 text-muted-foreground" />
          )}
        </label>
        <p className="mt-0.5 text-sm leading-snug text-muted-foreground">
          {meta.description}
        </p>
        {note && (
          <p
            id={noteId}
            className={cn(
              "mt-1.5 text-xs leading-snug",
              // A locked module's note explains a dead control, so it has to be
              // readable; the "also enables" hint is genuinely incidental.
              locked ? "text-muted-foreground" : "text-muted-foreground/80"
            )}
          >
            {note}
          </p>
        )}
      </div>

      <Switch
        id={`module-${type}`}
        checked={selected}
        onCheckedChange={() => onToggle(type)}
        disabled={busy || locked}
        aria-label={label}
        aria-describedby={note ? noteId : undefined}
        className={cn(
          "mt-0.5",
          // A locked module is fully on, not half-on. The default disabled fade
          // reads as an indeterminate switch, which is exactly the wrong thing to
          // say — the lock icon and the note carry "you can't change this".
          // Must be the `disabled:` variant so it replaces the base rule rather
          // than losing to it at the same specificity.
          locked && "disabled:opacity-100"
        )}
      />

      {/* Expanded settings sit in the text column, aligned with the module name. */}
      {selected && children && (
        <div className="col-start-2 row-start-2 pt-3">{children}</div>
      )}
    </div>
  )
}

/**
 * The Priced module's fee, shared by both surfaces so the field reads the same
 * whether the event is being created or edited.
 *
 * The peso sign sits inside the field rather than in the label: the amount is the
 * value, and a currency prefix is part of reading it. `action` is a fixed slot, so
 * a Save button appearing on first keystroke doesn't shove the input sideways.
 */
export function ModulePriceField({
  id,
  value,
  onChange,
  action,
  hint,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  action?: React.ReactNode
  hint: string
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        Price <span className="text-destructive">*</span>
      </Label>
      <div className="flex items-center gap-2">
        <div className="relative">
          <span
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
          >
            ₱
          </span>
          <Input
            id={id}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="2,500.00"
            className="w-40 pl-7 tabular-nums"
          />
        </div>
        {action && <div className="min-w-0">{action}</div>}
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}

export function ModuleList({
  eventType,
  enabled,
  selected,
  busy,
  onToggle,
  rows = {},
}: {
  eventType: EventType
  /** Modules currently on — what the dependency messaging reads. */
  enabled: EventModuleType[]
  /** Modules shown as checked. Same as `enabled` outside optimistic UI. */
  selected?: EventModuleType[]
  /** The module mid-write, if any. */
  busy?: EventModuleType | string | null
  onToggle: (type: EventModuleType) => void
  /** Per-module expanded content, rendered in the text column when on. */
  rows?: Partial<Record<EventModuleType, React.ReactNode>>
}) {
  const checked = selected ?? enabled
  const available = availableModules(eventType)
  const foundations = available.filter(isFoundation)
  const addOns = available.filter((type) => !isFoundation(type))

  const groups: { key: string; label: string; hint: string; types: EventModuleType[] }[] = [
    {
      key: "core",
      label: "Core",
      hint: "Other modules build on these.",
      types: foundations,
    },
    { key: "addons", label: "Add-ons", hint: "", types: addOns },
  ].filter((group) => group.types.length > 0)

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.key} className="space-y-2">
          <div className="flex items-baseline gap-2 px-0.5">
            <h4 className="text-xs font-medium text-foreground">{group.label}</h4>
            {group.hint && (
              <p className="text-xs text-muted-foreground">{group.hint}</p>
            )}
          </div>
          <div className="divide-y overflow-hidden rounded-lg border bg-card">
            {group.types.map((type) => (
              <ModuleRow
                key={type}
                type={type}
                enabled={enabled}
                selected={checked.includes(type)}
                busy={busy === type}
                onToggle={onToggle}
              >
                {rows[type]}
              </ModuleRow>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
