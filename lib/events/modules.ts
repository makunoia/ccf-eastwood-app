import type { EventModuleType, EventType } from "@/app/generated/prisma/client"

/**
 * Event add-on modules — the dependency graph and availability rules.
 *
 * Pure and DB-free on purpose: the server actions in `module-actions.ts` and the
 * Modules tab in Event Settings both import from here, so the switch the admin
 * sees disabled and the guard that rejects the write can never disagree.
 */

/**
 * What each module needs turned on beneath it.
 *
 * Embarkation assigns volunteers to buses; Breakout groups are led by volunteer
 * facilitators; Catch Mech converts *breakout* attendees into DGroup requests via
 * a facilitator link, so it needs both. Baptism, Priced, and Volunteers stand
 * alone.
 */
export const MODULE_REQUIRES: Record<EventModuleType, EventModuleType[]> = {
  Baptism: [],
  Embarkation: ["Volunteers"],
  CatchMech: ["Volunteers", "Breakout"],
  Volunteers: [],
  Breakout: ["Volunteers"],
  Priced: [],
}

export const ALL_MODULES = Object.keys(MODULE_REQUIRES) as EventModuleType[]

/**
 * Modules unavailable for an event type. Recurring events don't take payment and
 * don't run bus manifests — see the feature matrix in CLAUDE.md.
 *
 * Baptism is listed as OneTime/MultiDay-only in that matrix but has always been
 * offered for Recurring in the UI; leaving it available keeps existing recurring
 * events' opt-in data reachable rather than orphaning it here.
 */
const UNAVAILABLE_FOR_RECURRING: EventModuleType[] = ["Embarkation", "Priced"]

export function isModuleAvailable(type: EventModuleType, eventType: EventType): boolean {
  if (eventType === "Recurring") return !UNAVAILABLE_FOR_RECURRING.includes(type)
  return true
}

export function availableModules(eventType: EventType): EventModuleType[] {
  return ALL_MODULES.filter((type) => isModuleAvailable(type, eventType))
}

/**
 * Everything that must end up enabled to turn `target` on — the target plus the
 * transitive closure of its requirements, minus what's already enabled.
 *
 * Enabling Catch Mech on a bare event returns `[CatchMech, Volunteers, Breakout]`.
 */
export function modulesToEnable(
  target: EventModuleType,
  enabled: EventModuleType[]
): EventModuleType[] {
  const have = new Set(enabled)
  const out: EventModuleType[] = []
  const seen = new Set<EventModuleType>()

  function visit(type: EventModuleType) {
    if (seen.has(type)) return
    seen.add(type)
    for (const required of MODULE_REQUIRES[type]) visit(required)
    if (!have.has(type)) out.push(type)
  }

  visit(target)
  return out
}

/**
 * The module rows to create for a brand-new event: the admin's picks from the
 * create form, plus everything those picks depend on.
 *
 * Picks unavailable for the event type are dropped rather than rejected — the
 * form hides them, so a submission carrying one is stale or crafted, and neither
 * deserves to fail the whole creation. Requirements are pulled in regardless of
 * availability: a dependency is not optional.
 *
 * Returned in `ALL_MODULES` order so the created rows read consistently.
 */
export function resolveModuleSelection(
  picked: EventModuleType[],
  eventType: EventType
): EventModuleType[] {
  const selected = new Set<EventModuleType>()
  for (const type of picked) {
    if (!isModuleAvailable(type, eventType)) continue
    for (const required of modulesToEnable(type, [])) selected.add(required)
  }
  return ALL_MODULES.filter((type) => selected.has(type))
}

/**
 * Enabled modules that still require `target`, and so block disabling it.
 *
 * Only direct dependents are reported: a transitive one (Catch Mech needing
 * Volunteers *through* Breakout) is already held up by its own direct requirement,
 * and naming the nearest blocker is the more actionable message.
 */
export function blockingDependents(
  target: EventModuleType,
  enabled: EventModuleType[]
): EventModuleType[] {
  return enabled.filter(
    (type) => type !== target && MODULE_REQUIRES[type].includes(target)
  )
}

export const MODULE_LABELS: Record<EventModuleType, string> = {
  Baptism: "Baptism",
  Embarkation: "Embarkation",
  CatchMech: "Catch Mech",
  Volunteers: "Volunteers",
  Breakout: "Breakout Groups",
  Priced: "Priced Event",
}

/** "Catch Mech" / "Breakout Groups and Catch Mech" — for the blocked-toggle message. */
export function formatModuleList(modules: EventModuleType[]): string {
  const labels = modules.map((m) => MODULE_LABELS[m])
  if (labels.length <= 1) return labels[0] ?? ""
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`
}
