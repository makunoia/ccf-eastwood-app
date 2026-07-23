import type { DeclineReason } from "@/app/generated/prisma/client"

export const DECLINE_REASON_LABELS: Record<DeclineReason, string> = {
  NotInterested: "Not Interested",
  Unresponsive: "Unresponsive",
  EndorsedToAnotherLeader: "Endorsed to another leader",
  AlreadyInSmallGroup: "Already part of a DGroup",
  Others: "Others",
}

export const DECLINE_REASON_OPTIONS = (
  Object.entries(DECLINE_REASON_LABELS) as [DeclineReason, string][]
).map(([value, label]) => ({ value, label }))

/** Display string for a rejected request: preset label, or the free text for Others. */
export function formatDeclineReason(
  declineReason: DeclineReason | null,
  notes: string | null
): string | null {
  if (!declineReason) return notes
  if (declineReason === "Others") return notes ? `Others — ${notes}` : "Others"
  return DECLINE_REASON_LABELS[declineReason]
}
