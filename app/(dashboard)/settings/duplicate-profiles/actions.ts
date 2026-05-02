"use server"

import { db } from "@/lib/db"

type DuplicateRecord = {
  id: string
  firstName: string
  lastName: string
  recordType: "member" | "guest"
}

type DuplicateGroup = {
  field: "phone" | "email"
  value: string
  records: DuplicateRecord[]
}

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function getDuplicateProfiles(): Promise<ActionResult<DuplicateGroup[]>> {
  try {
    const [members, guests] = await Promise.all([
      db.member.findMany({
        select: { id: true, firstName: true, lastName: true, phone: true, email: true },
      }),
      db.guest.findMany({
        where: { memberId: null },
        select: { id: true, firstName: true, lastName: true, phone: true, email: true },
      }),
    ])

    const phoneMap = new Map<string, DuplicateRecord[]>()
    const emailMap = new Map<string, DuplicateRecord[]>()

    for (const m of members) {
      const record: DuplicateRecord = { id: m.id, firstName: m.firstName, lastName: m.lastName, recordType: "member" }
      if (m.phone) {
        const key = m.phone.trim().toLowerCase()
        phoneMap.set(key, [...(phoneMap.get(key) ?? []), record])
      }
      if (m.email) {
        const key = m.email.trim().toLowerCase()
        emailMap.set(key, [...(emailMap.get(key) ?? []), record])
      }
    }

    for (const g of guests) {
      const record: DuplicateRecord = { id: g.id, firstName: g.firstName, lastName: g.lastName, recordType: "guest" }
      if (g.phone) {
        const key = g.phone.trim().toLowerCase()
        phoneMap.set(key, [...(phoneMap.get(key) ?? []), record])
      }
      if (g.email) {
        const key = g.email.trim().toLowerCase()
        emailMap.set(key, [...(emailMap.get(key) ?? []), record])
      }
    }

    const groups: DuplicateGroup[] = []

    for (const [value, records] of phoneMap) {
      if (records.length > 1) groups.push({ field: "phone", value, records })
    }
    for (const [value, records] of emailMap) {
      if (records.length > 1) groups.push({ field: "email", value, records })
    }

    return { success: true, data: groups }
  } catch {
    return { success: false, error: "Failed to load duplicate profiles" }
  }
}
