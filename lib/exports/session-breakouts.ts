import { z } from "zod"

const staffSchema = z.object({ memberId: z.string(), name: z.string() })
const groupSchema = z.object({
  name: z.string(),
  registrantIds: z.array(z.string()),
  memberIds: z.array(z.string()),
  guestIds: z.array(z.string()),
  facilitator: staffSchema.nullable(),
  coFacilitator: staffSchema.nullable(),
})
export const sessionBreakoutSnapshotSchema = z.object({
  version: z.literal(1),
  capturedAt: z.string(),
  groups: z.array(groupSchema),
})
export type SessionBreakoutSnapshot = z.infer<typeof sessionBreakoutSnapshotSchema>

/** Resolve by person too: serving records and participant records share identity. */
export function sessionBreakoutDetails(
  snapshot: SessionBreakoutSnapshot | null,
  person: { id?: string; memberId?: string | null; guestId?: string | null },
) {
  const groups = snapshot?.groups.filter((g) =>
    (person.id && g.registrantIds.includes(person.id)) ||
    (person.memberId && (g.memberIds.includes(person.memberId) ||
      g.facilitator?.memberId === person.memberId || g.coFacilitator?.memberId === person.memberId)) ||
    (person.guestId && g.guestIds.includes(person.guestId)),
  ) ?? []
  // Preserve alignment with table names when only some tables have staff, but
  // don't export a delimiter as if it were a facilitator's name.
  const staffNames = (role: "facilitator" | "coFacilitator") => {
    const names = groups.map((g) => g[role]?.name ?? "")
    return names.some(Boolean) ? names.join("; ") : null
  }
  return {
    breakoutGroup: groups.map((g) => g.name).join("; ") || null,
    facilitator: staffNames("facilitator"),
    coFacilitator: staffNames("coFacilitator"),
  }
}
