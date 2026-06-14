"use server"

import { randomUUID } from "crypto"
import { db } from "@/lib/db"
import { formatPhilippinePhone } from "@/lib/utils"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function verifyMemberMobile(
  mobile: string
): Promise<ActionResult<{ token: string }>> {
  if (!mobile.trim()) {
    return { success: false, error: "Mobile number is required" }
  }

  try {
    const phone = formatPhilippinePhone(mobile)
    const member = await db.member.findFirst({
      where: { phone },
      select: { id: true, selfServiceToken: true },
    })
    if (!member) {
      return { success: false, error: "No member found with that mobile number" }
    }

    let token = member.selfServiceToken
    if (!token) {
      token = randomUUID()
      await db.member.update({
        where: { id: member.id },
        data: { selfServiceToken: token },
      })
    }

    return { success: true, data: { token } }
  } catch {
    return { success: false, error: "Something went wrong. Please try again." }
  }
}
