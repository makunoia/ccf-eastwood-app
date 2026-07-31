import { db } from "@/lib/db"

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0]

/** Roles that mark someone as one half of a couple within a family. */
export const SPOUSE_ROLES = ["FatherHusband", "MotherWife"] as const

export type SpouseInfo = {
  memberId: string
  firstName: string
  lastName: string
  smallGroupId: string | null
}

/**
 * Derives a member's spouse from Family data: the spouse is the other
 * Father/Mother in a family where this member is also a Father/Mother.
 * Families where the member is a Child/Guardian/Other never yield a spouse —
 * an adult who is a Child in their parents' family and a Father in their own
 * resolves the spouse from their own family only.
 *
 * Only member-linked spouses are returned (guests can't join groups directly).
 */
export async function findSpouse(memberId: string): Promise<SpouseInfo | null> {
  const parentLinks = await db.familyMember.findMany({
    where: { memberId, role: { in: [...SPOUSE_ROLES] } },
    select: { familyId: true },
  })
  if (parentLinks.length === 0) return null

  const spouseLink = await db.familyMember.findFirst({
    where: {
      familyId: { in: parentLinks.map((l) => l.familyId) },
      role: { in: [...SPOUSE_ROLES] },
      AND: [{ memberId: { not: null } }, { memberId: { not: memberId } }],
    },
    select: {
      member: {
        select: { id: true, firstName: true, lastName: true, smallGroupId: true },
      },
    },
    orderBy: { createdAt: "asc" },
  })
  if (!spouseLink?.member) return null

  return {
    memberId: spouseLink.member.id,
    firstName: spouseLink.member.firstName,
    lastName: spouseLink.member.lastName,
    smallGroupId: spouseLink.member.smallGroupId,
  }
}

export type SpousePersonRef =
  | { memberId: string; guestId?: never }
  | { guestId: string; memberId?: never }

export type SpousePersonInfo = {
  /** Exactly one of memberId / guestId is set — mirrors FamilyMember. */
  memberId: string | null
  guestId: string | null
  firstName: string
  lastName: string
  /** Members only — null for guest spouses. */
  smallGroupId: string | null
}

/**
 * Person-generic spouse derivation: works for members AND guests, and the
 * spouse it returns may itself be a member or a guest. Same family rule as
 * `findSpouse` — both halves must hold a Father/Mother role in a shared
 * family. Used by catch-mech, where the subject is usually still a guest.
 */
export async function findSpouseOfPerson(
  person: SpousePersonRef
): Promise<SpousePersonInfo | null> {
  const parentLinks = await db.familyMember.findMany({
    where: {
      ...(person.memberId ? { memberId: person.memberId } : { guestId: person.guestId }),
      role: { in: [...SPOUSE_ROLES] },
    },
    select: { familyId: true, id: true },
  })
  if (parentLinks.length === 0) return null

  const spouseLink = await db.familyMember.findFirst({
    where: {
      familyId: { in: parentLinks.map((l) => l.familyId) },
      role: { in: [...SPOUSE_ROLES] },
      id: { notIn: parentLinks.map((l) => l.id) },
    },
    select: {
      member: {
        select: { id: true, firstName: true, lastName: true, smallGroupId: true },
      },
      guest: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { createdAt: "asc" },
  })
  if (!spouseLink) return null

  if (spouseLink.member) {
    return {
      memberId: spouseLink.member.id,
      guestId: null,
      firstName: spouseLink.member.firstName,
      lastName: spouseLink.member.lastName,
      smallGroupId: spouseLink.member.smallGroupId,
    }
  }
  if (spouseLink.guest) {
    return {
      memberId: null,
      guestId: spouseLink.guest.id,
      firstName: spouseLink.guest.firstName,
      lastName: spouseLink.guest.lastName,
      smallGroupId: null,
    }
  }
  return null
}

/**
 * Pairs up a roster of members into couples using shared Father/Mother family
 * links. Returns a map of memberId → spouse memberId for every paired member
 * (both directions present). Members without their partner in the roster are
 * simply absent from the map.
 */
export async function mapCouplesInRoster(
  memberIds: string[]
): Promise<Map<string, string>> {
  const pairs = new Map<string, string>()
  if (memberIds.length < 2) return pairs

  const links = await db.familyMember.findMany({
    where: {
      memberId: { in: memberIds },
      role: { in: [...SPOUSE_ROLES] },
    },
    select: { familyId: true, memberId: true },
  })

  const byFamily = new Map<string, string[]>()
  for (const link of links) {
    if (!link.memberId) continue
    const list = byFamily.get(link.familyId) ?? []
    list.push(link.memberId)
    byFamily.set(link.familyId, list)
  }

  for (const membersInFamily of byFamily.values()) {
    if (membersInFamily.length !== 2) continue
    const [a, b] = membersInFamily
    if (!pairs.has(a) && !pairs.has(b)) {
      pairs.set(a, b)
      pairs.set(b, a)
    }
  }
  return pairs
}

export type FamilyPersonRef =
  | { memberId: string; guestId?: never }
  | { guestId: string; memberId?: never }

/**
 * The family a person heads as one half of its couple — the inverse of
 * `findSpouseOfPerson`, and the identity rule for household registration
 * (CCF-122): a household is deduped by its Father/Husband + Mother/Wife records,
 * not by matching individual members.
 *
 * Spouses reliably carry their own mobile number, so they resolve cleanly
 * through the normal phone → email → name+birthday ladder; children, who
 * usually have no contact details, are then matched *within* the family this
 * returns rather than guessed at globally.
 *
 * Only spouse-role links count. Someone who is a Child in their parents' family
 * does not match through that family — they'd only match the family they head
 * themselves.
 */
export async function findFamilyBySpouse(
  person: FamilyPersonRef,
  client: TxClient | typeof db = db
): Promise<{ id: string; name: string } | null> {
  const link = await client.familyMember.findFirst({
    where: {
      ...(person.memberId ? { memberId: person.memberId } : { guestId: person.guestId }),
      role: { in: [...SPOUSE_ROLES] },
    },
    select: { family: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  })
  return link?.family ?? null
}

/**
 * The household a person belongs to, as a display label: the family name plus
 * how many *other* people are in it ("dela Cruz Family (+2 members)").
 *
 * Both refs null returns null rather than querying. A registrant whose person
 * FKs are both null is either a truly anonymous registrant (name typed straight
 * onto the row) or an orphan left by a pre-cascade member deletion; neither has
 * a household. Passing that ref through would build the filter `{ guestId: null }`,
 * which Postgres reads as `guestId IS NULL` — matching every member-linked
 * FamilyMember row in the database and labelling the registrant with whichever
 * family happened to be created first.
 */
export async function getHouseholdLabel(
  ref: { memberId: string | null; guestId: string | null }
): Promise<string | null> {
  if (!ref.memberId && !ref.guestId) return null

  const link = await db.familyMember.findFirst({
    where: ref.memberId ? { memberId: ref.memberId } : { guestId: ref.guestId as string },
    select: {
      family: { select: { name: true, _count: { select: { members: true } } } },
    },
    orderBy: { createdAt: "asc" },
  })
  if (!link) return null

  const others = link.family._count.members - 1
  return others > 0
    ? `${link.family.name} (+${others} ${others === 1 ? "member" : "members"})`
    : link.family.name
}

/**
 * Re-points every FamilyMember row from one person onto another, preserving
 * family membership across identity changes:
 *
 * - Guest promotion:        { guestId }  → { memberId }
 * - Promotion undo:         { memberId } → { guestId }   (member row is deleted after)
 * - Duplicate-profile merge: loser ref   → keeper ref    (loser row is deleted after)
 *
 * If the target person already belongs to a family the source is in, the
 * source's row is dropped and the target's existing role wins — mirroring the
 * "keeper wins" rule used by duplicate-profile merges.
 */
export async function repointFamilyLinks(
  tx: TxClient,
  from: FamilyPersonRef,
  to: FamilyPersonRef
): Promise<void> {
  await repointFamilyLinksBatch(tx, [{ from, to }])
}

/**
 * Batched `repointFamilyLinks` for callers promoting several people at once.
 *
 * Same rules, but the reads collapse to two queries for the whole set instead of
 * one findMany plus a findFirst per link. Catch Mech runs this inside an
 * interactive transaction while a facilitator waits, so a table of ten used to
 * mean a per-person read round trip each — the slowest part of the submission
 * and the one that grew with the group.
 */
export async function repointFamilyLinksBatch(
  tx: TxClient,
  pairs: { from: FamilyPersonRef; to: FamilyPersonRef }[]
): Promise<void> {
  if (pairs.length === 0) return

  const sourceKey = (ref: FamilyPersonRef) =>
    ref.memberId ? `m:${ref.memberId}` : `g:${ref.guestId}`

  const links = await tx.familyMember.findMany({
    where: {
      OR: pairs.map(({ from }) =>
        from.memberId ? { memberId: from.memberId } : { guestId: from.guestId }
      ),
    },
    select: { id: true, familyId: true, memberId: true, guestId: true },
  })
  if (links.length === 0) return

  // Every family any source belongs to, paired with every target — one read tells
  // us which targets are already in which family.
  const familyIds = [...new Set(links.map((l) => l.familyId))]
  const targetMemberIds = pairs.map((p) => p.to.memberId).filter((id): id is string => !!id)
  const targetGuestIds = pairs.map((p) => p.to.guestId).filter((id): id is string => !!id)

  const occupied = await tx.familyMember.findMany({
    where: {
      familyId: { in: familyIds },
      OR: [
        ...(targetMemberIds.length > 0 ? [{ memberId: { in: targetMemberIds } }] : []),
        ...(targetGuestIds.length > 0 ? [{ guestId: { in: targetGuestIds } }] : []),
      ],
    },
    select: { familyId: true, memberId: true, guestId: true },
  })
  const taken = new Set(
    occupied.map((o) => `${o.familyId}|${o.memberId ? `m:${o.memberId}` : `g:${o.guestId}`}`)
  )

  const targetBySource = new Map(pairs.map((p) => [sourceKey(p.from), p.to]))

  // The target already holds a place in this family — drop the source row and let
  // the target's existing role win, mirroring the duplicate-merge "keeper wins" rule.
  const toDelete: string[] = []
  // Otherwise carry the row over, grouped by target so each one is a single update.
  const toRepoint = new Map<string, { to: FamilyPersonRef; ids: string[] }>()

  for (const link of links) {
    const key = link.memberId ? `m:${link.memberId}` : `g:${link.guestId}`
    const to = targetBySource.get(key)
    if (!to) continue
    const targetKey = to.memberId ? `m:${to.memberId}` : `g:${to.guestId}`
    if (taken.has(`${link.familyId}|${targetKey}`)) {
      toDelete.push(link.id)
      continue
    }
    // Claim the slot now: the sequential version saw its own writes, so a second
    // row for the same person in the same family collapsed into a delete rather
    // than landing the target in that family twice.
    taken.add(`${link.familyId}|${targetKey}`)
    const bucket = toRepoint.get(targetKey)
    if (bucket) bucket.ids.push(link.id)
    else toRepoint.set(targetKey, { to, ids: [link.id] })
  }

  if (toDelete.length > 0) {
    await tx.familyMember.deleteMany({ where: { id: { in: toDelete } } })
  }
  for (const { to, ids } of toRepoint.values()) {
    await tx.familyMember.updateMany({
      where: { id: { in: ids } },
      data: to.memberId
        ? { memberId: to.memberId, guestId: null }
        : { guestId: to.guestId, memberId: null },
    })
  }
}
