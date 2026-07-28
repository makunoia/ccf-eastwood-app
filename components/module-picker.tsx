"use client"

import * as React from "react"

import { ModuleList, ModulePriceField } from "@/components/module-list"
import { availableModules, modulesToEnable } from "@/lib/events/modules"
import type { EventModuleSelection } from "@/lib/validations/event"
import type { EventModuleType, EventType } from "@/app/generated/prisma/client"

/**
 * Module selection for the create-event form (CCF-131).
 *
 * The same dependency graph the server enforces drives the switches here:
 * turning one on pulls in what it requires, and one that something else requires
 * can't be turned off. `resolveModuleSelection` re-derives the closure server-side,
 * so a stale or crafted submission lands on the same set this UI showed.
 *
 * Editing modules after creation happens in Event Settings → Modules, which
 * writes through `enableModule` / `disableModule` one at a time; this component is
 * purely controlled state, because nothing exists to write to yet.
 */
export function ModulePicker({
  eventType,
  value,
  onChange,
}: {
  eventType: EventType
  value: EventModuleSelection
  onChange: (next: EventModuleSelection) => void
}) {
  const available = availableModules(eventType)

  // A type change can strand a pick that the new type doesn't offer (Priced and
  // Embarkation aren't available for Recurring). Drop those rather than silently
  // submitting them — the server would ignore them anyway.
  React.useEffect(() => {
    const kept = value.types.filter((type) => available.includes(type))
    if (kept.length !== value.types.length) {
      onChange({ ...value, types: kept })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventType])

  function toggle(type: EventModuleType) {
    const isSelected = value.types.includes(type)
    if (isSelected) {
      onChange({ ...value, types: value.types.filter((t) => t !== type) })
      return
    }
    // Pull in requirements, mirroring `enableModule`'s closure.
    const next = new Set(value.types)
    for (const required of modulesToEnable(type, value.types)) next.add(required)
    onChange({ ...value, types: available.filter((t) => next.has(t)) })
  }

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">Modules</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          What this event uses. The sidebar, the setup steps, and what the
          registration form collects all follow from these. Everything here can be
          changed later in Event Settings.
        </p>
      </div>

      <ModuleList
        eventType={eventType}
        enabled={value.types}
        onToggle={toggle}
        rows={{
          Priced: (
            <ModulePriceField
              id="module-price"
              value={value.price}
              onChange={(price) => onChange({ ...value, price })}
              hint="The registration form asks for a payment reference against this amount."
            />
          ),
        }}
      />
    </section>
  )
}
