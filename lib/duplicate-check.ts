import { db } from "@/lib/db"

type ConflictResult = { conflict: true; message: string } | { conflict: false }

/**
 * Check whether a phone or email is already used by any other Guest or Member record.
 * Guest queries only include active (non-promoted) guests (memberId: null).
 * Pass excludeMemberId/excludeGuestId to skip the current record when updating.
 */
export async function checkDuplicateContactInfo(opts: {
  phone?: string | null
  email?: string | null
  excludeMemberId?: string | null
  excludeGuestId?: string | null
}): Promise<ConflictResult> {
  const { phone, email, excludeMemberId, excludeGuestId } = opts

  if (phone?.trim()) {
    const p = phone.trim()

    const memberWithPhone = await db.member.findFirst({
      where: {
        phone: p,
        ...(excludeMemberId ? { NOT: { id: excludeMemberId } } : {}),
      },
      select: { firstName: true, lastName: true },
    })
    if (memberWithPhone) {
      return {
        conflict: true,
        message: `Mobile number ${p} is already used by ${memberWithPhone.firstName} ${memberWithPhone.lastName} (Member). Each profile must have a unique mobile number.`,
      }
    }

    const guestWithPhone = await db.guest.findFirst({
      where: {
        phone: p,
        memberId: null,
        ...(excludeGuestId ? { NOT: { id: excludeGuestId } } : {}),
      },
      select: { firstName: true, lastName: true },
    })
    if (guestWithPhone) {
      return {
        conflict: true,
        message: `Mobile number ${p} is already used by ${guestWithPhone.firstName} ${guestWithPhone.lastName} (Guest). Each profile must have a unique mobile number.`,
      }
    }
  }

  if (email?.trim()) {
    const e = email.trim()

    const memberWithEmail = await db.member.findFirst({
      where: {
        email: { equals: e, mode: "insensitive" },
        ...(excludeMemberId ? { NOT: { id: excludeMemberId } } : {}),
      },
      select: { firstName: true, lastName: true },
    })
    if (memberWithEmail) {
      return {
        conflict: true,
        message: `Email ${e} is already used by ${memberWithEmail.firstName} ${memberWithEmail.lastName} (Member). Each profile must have a unique email address.`,
      }
    }

    const guestWithEmail = await db.guest.findFirst({
      where: {
        email: { equals: e, mode: "insensitive" },
        memberId: null,
        ...(excludeGuestId ? { NOT: { id: excludeGuestId } } : {}),
      },
      select: { firstName: true, lastName: true },
    })
    if (guestWithEmail) {
      return {
        conflict: true,
        message: `Email ${e} is already used by ${guestWithEmail.firstName} ${guestWithEmail.lastName} (Guest). Each profile must have a unique email address.`,
      }
    }
  }

  return { conflict: false }
}
