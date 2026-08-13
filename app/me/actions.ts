"use server"

import { randomUUID } from "crypto"
import { db } from "@/lib/db"
import { formatPhilippinePhone } from "@/lib/utils"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

/**
 * Resolves a mobile number to a portal token.
 *
 * Members are looked up first: someone who is both a Member and a (retained,
 * promoted) Guest is a member, and the guest row is only their history. A guest
 * who has not been promoted gets a token of their own so the portal can ask who
 * their leader is — answering that promotes them and hands back a member token.
 */
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

    if (member) {
      let token = member.selfServiceToken
      if (!token) {
        token = randomUUID()
        await db.member.update({
          where: { id: member.id },
          data: { selfServiceToken: token },
        })
      }
      return { success: true, data: { token } }
    }

    const guest = await db.guest.findFirst({
      where: { phone, memberId: null },
      select: { id: true, selfServiceToken: true },
    })
    if (!guest) {
      return { success: false, error: "We couldn't find you with that mobile number" }
    }

    let token = guest.selfServiceToken
    if (!token) {
      token = randomUUID()
      await db.guest.update({
        where: { id: guest.id },
        data: { selfServiceToken: token },
      })
    }

    return { success: true, data: { token } }
  } catch {
    return { success: false, error: "Something went wrong. Please try again." }
  }
}
