"use server"

import { db } from "@/lib/db"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function submitLeaderApproval(
  token: string,
  decision: "approve" | "reject",
  notes: string
): Promise<ActionResult> {
  const volunteer = await db.volunteer.findUnique({
    where: { leaderApprovalToken: token },
    select: { id: true, status: true },
  })

  if (!volunteer) {
    return { success: false, error: "Approval link not found or has expired." }
  }

  if (volunteer.status !== "Pending") {
    return {
      success: false,
      error: `This volunteer application has already been ${volunteer.status.toLowerCase()}.`,
    }
  }

  try {
    await db.volunteer.update({
      where: { id: volunteer.id },
      data: {
        status: decision === "approve" ? "Confirmed" : "Rejected",
        leaderNotes: notes.trim() || null,
      },
    })
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to submit your response. Please try again." }
  }
}
