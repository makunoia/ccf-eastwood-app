"use server"

import { randomUUID } from "crypto"
import { db } from "@/lib/db"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

type GroupResult = {
  token: string
  groupName: string
  pendingCount: number
}

export async function verifyLeaderMobile(
  mobile: string
): Promise<ActionResult<{ groups: GroupResult[] }>> {
  if (!mobile.trim()) {
    return { success: false, error: "Mobile number is required" }
  }

  const member = await db.member.findFirst({
    where: { phone: mobile.trim() },
    select: { id: true },
  })
  if (!member) {
    return { success: false, error: "No member found with that mobile number" }
  }

  const groups = await db.smallGroup.findMany({
    where: { leaderId: member.id },
    select: {
      id: true,
      name: true,
      leaderConfirmationToken: true,
      memberRequests: {
        where: { status: "Pending" },
        select: { id: true },
      },
    },
  })

  if (groups.length === 0) {
    return { success: false, error: "You are not registered as a DGroup leader" }
  }

  const results: GroupResult[] = await Promise.all(
    groups.map(async (g) => {
      let token = g.leaderConfirmationToken
      if (!token) {
        token = randomUUID()
        await db.smallGroup.update({
          where: { id: g.id },
          data: { leaderConfirmationToken: token },
        })
      }
      return {
        token,
        groupName: g.name,
        pendingCount: g.memberRequests.length,
      }
    })
  )

  return { success: true, data: { groups: results } }
}
