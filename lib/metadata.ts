import { cache } from "react"
import { db } from "@/lib/db"

/**
 * Name lookups used only to build page titles. Wrapped in `cache` so a
 * generateMetadata call and the page render in the same request share one query.
 */

export const getEventName = cache(async (id: string): Promise<string | null> => {
  const event = await db.event.findUnique({ where: { id }, select: { name: true } })
  return event?.name ?? null
})

export const getMinistryName = cache(async (id: string): Promise<string | null> => {
  const ministry = await db.ministry.findUnique({ where: { id }, select: { name: true } })
  return ministry?.name ?? null
})

/** Builds "Juan Dela Cruz · Members" style titles, tolerating missing records. */
export function personTitle(
  person: { firstName: string; lastName: string } | null | undefined,
  section: string
): string {
  if (!person) return section
  return `${person.firstName} ${person.lastName} · ${section}`
}

type RegistrantName = {
  firstName: string | null
  lastName: string | null
  member: { firstName: string; lastName: string } | null
  guest: { firstName: string; lastName: string } | null
}

/**
 * Mirrors the registrant display-name fallback: a registrant carries personal
 * fields only when it links to neither a member nor a guest (e.g. walk-ins).
 */
export function registrantName(r: RegistrantName | null | undefined, fallback: string): string {
  if (!r) return fallback
  if (r.member) return `${r.member.firstName} ${r.member.lastName}`
  if (r.guest) return `${r.guest.firstName} ${r.guest.lastName}`
  return `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || fallback
}

/** The select needed to satisfy `registrantName`. */
export const registrantNameSelect = {
  firstName: true,
  lastName: true,
  member: { select: { firstName: true, lastName: true } },
  guest: { select: { firstName: true, lastName: true } },
} as const
