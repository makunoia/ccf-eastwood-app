import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { db } from "@/lib/db"
import { fetchBreakoutCandidates } from "@/lib/breakout-suggestion-server"
import { suggestBreakoutGroup, breakoutPickerOptions } from "@/lib/breakout-suggestion"
import { assignBreakoutForRegistrant } from "@/lib/events/registration-core"

/**
 * The breakout selection screen offers profile-matched tables, emptiest first.
 *
 * Two gaps this pins, both of which made the picker point everyone at one table:
 *
 *  - **Life stage never reached the public form.** The candidate row carried
 *    gender focus and an age range but not the group's accepted life stages, so
 *    a table run for one life stage was offered to everybody. Gender was the
 *    only profile criterion the picker applied.
 *  - **Uncapped tables were indistinguishable.** Ranking used `roomRatio`, the
 *    share of the *cap* still open, which is `null` when a group has no
 *    `memberLimit`. A day whose tables are created without limits — the ordinary
 *    case — therefore scored every table alike, and the stable sort handed the
 *    top of the list to whichever was created first, permanently.
 *
 * The unit tests over `suggestBreakoutGroup` / `resolveFillLevels` cover the
 * rules themselves; these go through Prisma, because both bugs were in what the
 * query selected and how the set was reduced, not in the ranking arithmetic.
 */

beforeEach(async () => {
  vi.clearAllMocks()
  await db.$executeRaw`TRUNCATE "BreakoutGroupMember", "BreakoutGroup", "EventModule", "EventRegistrant", "EventOccurrence", "Event", "LifeStage", "Member", "Guest" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedEvent() {
  const event = await db.event.create({
    data: { name: "Retreat", type: "OneTime", startDate: new Date(), endDate: new Date() },
  })
  await db.eventModule.create({ data: { eventId: event.id, type: "Breakout" } })
  return event
}

function seedLifeStage(name: string, order: number) {
  return db.lifeStage.create({ data: { name, order } })
}

function seedGroup(
  eventId: string,
  name: string,
  opts: { memberLimit?: number | null; lifeStageIds?: string[]; createdAt?: Date } = {}
) {
  return db.breakoutGroup.create({
    data: {
      eventId,
      name,
      memberLimit: opts.memberLimit ?? null,
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
      ...(opts.lifeStageIds?.length
        ? { lifeStages: { connect: opts.lifeStageIds.map((id) => ({ id })) } }
        : {}),
    },
  })
}

/** Put `count` people in `groupId`, so the group reads as that full. */
async function fill(eventId: string, groupId: string, count: number) {
  for (let i = 0; i < count; i++) {
    const r = await db.eventRegistrant.create({
      data: { eventId, firstName: `P${groupId.slice(-4)}${i}`, lastName: "Tester" },
    })
    await db.breakoutGroupMember.create({
      data: { breakoutGroupId: groupId, registrantId: r.id },
    })
  }
}

const anyone = { gender: null, birthYear: null }

describe("life stage reaches the picker", () => {
  it("carries each group's accepted life stages onto the candidate", async () => {
    const event = await seedEvent()
    const singles = await seedLifeStage("Singles", 1)
    const married = await seedLifeStage("Married", 2)
    await seedGroup(event.id, "Both", { lifeStageIds: [singles.id, married.id] })
    await seedGroup(event.id, "Open")

    const candidates = await fetchBreakoutCandidates(event.id, null, false)
    const both = candidates.find((c) => c.name === "Both")
    const open = candidates.find((c) => c.name === "Open")

    expect(both?.lifeStageIds.sort()).toEqual([singles.id, married.id].sort())
    // Empty means "accepts everyone" — not "accepts nobody".
    expect(open?.lifeStageIds).toEqual([])
  })

  it("hides a table run for another life stage, and suggests the right one", async () => {
    const event = await seedEvent()
    const singles = await seedLifeStage("Singles", 1)
    const married = await seedLifeStage("Married", 2)
    await seedGroup(event.id, "Singles Table", { lifeStageIds: [singles.id] })
    await seedGroup(event.id, "Married Table", { lifeStageIds: [married.id] })

    const candidates = await fetchBreakoutCandidates(event.id, null, false)
    const profile = { ...anyone, lifeStageId: married.id }

    expect(breakoutPickerOptions(candidates, { gender: null, lifeStageId: married.id }).map((g) => g.name)).toEqual([
      "Married Table",
    ])
    expect(suggestBreakoutGroup(candidates, profile)?.name).toBe("Married Table")
  })

  it("offers both tables to someone whose life stage was never asked", async () => {
    const event = await seedEvent()
    const singles = await seedLifeStage("Singles", 1)
    const married = await seedLifeStage("Married", 2)
    await seedGroup(event.id, "Singles Table", { lifeStageIds: [singles.id] })
    await seedGroup(event.id, "Married Table", { lifeStageIds: [married.id] })

    const candidates = await fetchBreakoutCandidates(event.id, null, false)
    expect(breakoutPickerOptions(candidates, { gender: null, lifeStageId: null })).toHaveLength(2)
  })
})

describe("uncapped tables spread instead of stacking", () => {
  it("suggests the emptiest of three uncapped tables, not the oldest", async () => {
    const event = await seedEvent()
    // Created in this order, so the pre-fix ranking would return Alpha forever.
    const alpha = await seedGroup(event.id, "Alpha")
    const beta = await seedGroup(event.id, "Beta")
    await seedGroup(event.id, "Gamma")

    await fill(event.id, alpha.id, 4)
    await fill(event.id, beta.id, 2)

    const candidates = await fetchBreakoutCandidates(event.id, null, false)
    expect(suggestBreakoutGroup(candidates, anyone)?.name).toBe("Gamma")
    expect(breakoutPickerOptions(candidates).map((g) => g.name)).toEqual([
      "Gamma",
      "Beta",
      "Alpha",
    ])
  })

  it("moves the suggestion on as each table fills", async () => {
    const event = await seedEvent()
    const alpha = await seedGroup(event.id, "Alpha")
    const beta = await seedGroup(event.id, "Beta")

    // Nobody placed: the tie falls to declaration order, and Alpha is first.
    let candidates = await fetchBreakoutCandidates(event.id, null, false)
    expect(suggestBreakoutGroup(candidates, anyone)?.name).toBe("Alpha")

    // One person into Alpha and the suggestion moves — the rotation the whole
    // change exists for. Before `fillLevel` this stayed on Alpha indefinitely,
    // because an uncapped group's `roomRatio` was null however many it held.
    await fill(event.id, alpha.id, 1)
    candidates = await fetchBreakoutCandidates(event.id, null, false)
    expect(suggestBreakoutGroup(candidates, anyone)?.name).toBe("Beta")

    await fill(event.id, beta.id, 2)
    candidates = await fetchBreakoutCandidates(event.id, null, false)
    expect(suggestBreakoutGroup(candidates, anyone)?.name).toBe("Alpha")
  })

  /**
   * Regression: the tie above used to be settled by luck.
   *
   * `BreakoutGroup.createdAt` is a `TIMESTAMP(3)`, and two `create` calls in a
   * row land in the same millisecond about a third of the time — so ordering on
   * `createdAt` alone left Postgres free to return the pair either way round,
   * and "the tie falls to declaration order" held only when the clock happened
   * to tick between the two inserts. The test above passed alone and failed in
   * the full suite for exactly that reason.
   *
   * Seeding an identical `createdAt` makes the tie certain rather than likely,
   * so this fails every run without the `id` tiebreak instead of one in three.
   */
  it("orders tables that share a createdAt millisecond by creation order", async () => {
    const event = await seedEvent()
    const sameInstant = new Date("2026-03-01T09:00:00.000Z")
    const alpha = await seedGroup(event.id, "Alpha", { createdAt: sameInstant })
    await seedGroup(event.id, "Beta", { createdAt: sameInstant })
    await seedGroup(event.id, "Gamma", { createdAt: sameInstant })

    // Nothing separates the three: same instant, no caps, nobody placed. Only
    // the tiebreak decides, so the order is the order they were declared in.
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidates = await fetchBreakoutCandidates(event.id, null, false)
      expect(candidates.map((c) => c.name)).toEqual(["Alpha", "Beta", "Gamma"])
      expect(suggestBreakoutGroup(candidates, anyone)?.name).toBe("Alpha")
    }

    // And the rotation still runs on top of it: fill level outranks the
    // tiebreak, so the tie only decides what's left genuinely level.
    await fill(event.id, alpha.id, 1)
    const after = await fetchBreakoutCandidates(event.id, null, false)
    expect(suggestBreakoutGroup(after, anyone)?.name).toBe("Beta")
  })

  it("measures a capped table by its cap and an uncapped one against the mean", async () => {
    const event = await seedEvent()
    const big = await seedGroup(event.id, "Big", { memberLimit: 20 })
    const small = await seedGroup(event.id, "Small", { memberLimit: 5 })

    await fill(event.id, big.id, 4) // 4/20 = 0.20
    await fill(event.id, small.id, 2) // 2/5  = 0.40

    const candidates = await fetchBreakoutCandidates(event.id, null, false)
    // The big table holds twice as many people and is still the emptier one.
    expect(suggestBreakoutGroup(candidates, anyone)?.name).toBe("Big")
  })

  it("never suggests a table that is full, however the rest are ranked", async () => {
    const event = await seedEvent()
    const tight = await seedGroup(event.id, "Tight", { memberLimit: 2 })
    const roomy = await seedGroup(event.id, "Roomy", { memberLimit: 50 })

    await fill(event.id, tight.id, 2)
    await fill(event.id, roomy.id, 40)

    const candidates = await fetchBreakoutCandidates(event.id, null, false)
    expect(suggestBreakoutGroup(candidates, anyone)?.name).toBe("Roomy")
    // …but a full table still renders in the list, marked, rather than vanishing.
    const options = breakoutPickerOptions(candidates)
    expect(options.map((g) => g.name).sort()).toEqual(["Roomy", "Tight"])
    expect(options.find((g) => g.name === "Tight")?.isFull).toBe(true)
  })
})

describe("auto-assign applies the same rules as the picker", () => {
  // The two are alternatives on one form — `autoAssignBreakout` suppresses the
  // picker — so a table the selection screen would hide must not be one
  // auto-assign quietly drops the same person into.
  it("respects the life stage the picker filters on", async () => {
    const event = await db.event.update({
      where: { id: (await seedEvent()).id },
      data: { autoAssignBreakout: true },
    })
    const singles = await seedLifeStage("Singles", 1)
    const married = await seedLifeStage("Married", 2)
    await seedGroup(event.id, "Singles Table", { lifeStageIds: [singles.id] })
    const marriedTable = await seedGroup(event.id, "Married Table", {
      lifeStageIds: [married.id],
    })

    const guest = await db.guest.create({
      data: { firstName: "Mara", lastName: "Tester", lifeStageId: married.id, language: [] },
    })
    const registrant = await db.eventRegistrant.create({
      data: { eventId: event.id, guestId: guest.id },
    })

    const assigned = await assignBreakoutForRegistrant(registrant.id, event.id, null, {
      gender: null,
      birthYear: null,
      lifeStageId: married.id,
    })
    expect(assigned?.id).toBe(marriedTable.id)
  })

  it("spreads across uncapped tables instead of stacking into the oldest", async () => {
    const event = await db.event.update({
      where: { id: (await seedEvent()).id },
      data: { autoAssignBreakout: true },
    })
    const alpha = await seedGroup(event.id, "Alpha")
    const beta = await seedGroup(event.id, "Beta")

    const placements: string[] = []
    for (const name of ["One", "Two", "Three", "Four"]) {
      const r = await db.eventRegistrant.create({
        data: { eventId: event.id, firstName: name, lastName: "Tester" },
      })
      const assigned = await assignBreakoutForRegistrant(r.id, event.id, null, {
        gender: null,
        birthYear: null,
        lifeStageId: null,
      })
      placements.push(assigned?.id ?? "none")
    }

    // Two apiece. Before `fillLevel` all four landed in Alpha, because an
    // uncapped group's `roomRatio` was null however many people it held.
    expect(placements.filter((id) => id === alpha.id)).toHaveLength(2)
    expect(placements.filter((id) => id === beta.id)).toHaveLength(2)
  })
})

describe("the fill figure is a ratio, never a headcount", () => {
  // `withoutOccupancy` strips the counts on the public register form; the
  // ordering has to survive that, which is why `fillLevel` is normalised rather
  // than being the raw `memberCount`.
  it("orders the same once occupancy has been stripped", async () => {
    const event = await seedEvent()
    const alpha = await seedGroup(event.id, "Alpha")
    await seedGroup(event.id, "Beta")
    await fill(event.id, alpha.id, 3)

    const candidates = await fetchBreakoutCandidates(event.id, null, false)
    const stripped = candidates.map((c) => ({ ...c, occupancy: null }))

    expect(breakoutPickerOptions(stripped).map((g) => g.name)).toEqual(["Beta", "Alpha"])
    expect(suggestBreakoutGroup(stripped, anyone)?.name).toBe("Beta")
    expect(stripped.every((c) => c.fillLevel >= 0 && c.fillLevel <= 1)).toBe(true)
  })
})

describe("life stage stands in for a gender the form never asked", () => {
  /**
   * The whole point of the fallback, through Prisma because the ranking depends
   * on `fillLevel` being reduced across the real set by `resolveFillLevels`.
   *
   * Before it, the emptier catch-all won every arrival and the person's known
   * life stage counted for nothing — the one strong signal left once gender is
   * out of play.
   */
  it("seats an unknown-gender registrant by life stage over an emptier catch-all", async () => {
    const event = await db.event.update({
      where: { id: (await seedEvent()).id },
      data: { autoAssignBreakout: true },
    })
    const singles = await seedLifeStage("Singles", 1)
    const singlesTable = await seedGroup(event.id, "Singles Table", {
      lifeStageIds: [singles.id],
    })
    const open = await seedGroup(event.id, "Open Table")
    // The matching table is the fuller of the two, so emptiest-first alone would
    // pick the other one.
    await fill(event.id, singlesTable.id, 4)

    const guest = await db.guest.create({
      data: { firstName: "Sam", lastName: "Tester", lifeStageId: singles.id, language: [] },
    })
    const registrant = await db.eventRegistrant.create({
      data: { eventId: event.id, guestId: guest.id },
    })

    const assigned = await assignBreakoutForRegistrant(registrant.id, event.id, null, {
      gender: null,
      birthYear: null,
      lifeStageId: singles.id,
    })
    expect(assigned?.id).toBe(singlesTable.id)
    expect(assigned?.id).not.toBe(open.id)
  })

  it("still spreads across two tables of the same life stage", async () => {
    // The promotion lifts a tier, not a table. Within the tier `fillLevel` still
    // rotates, so a life-staged day doesn't stack everyone into one table.
    const event = await db.event.update({
      where: { id: (await seedEvent()).id },
      data: { autoAssignBreakout: true },
    })
    const singles = await seedLifeStage("Singles", 1)
    const a = await seedGroup(event.id, "Singles A", { lifeStageIds: [singles.id] })
    const b = await seedGroup(event.id, "Singles B", { lifeStageIds: [singles.id] })

    const placements: string[] = []
    for (const name of ["One", "Two", "Three", "Four"]) {
      const guest = await db.guest.create({
        data: { firstName: name, lastName: "Tester", lifeStageId: singles.id, language: [] },
      })
      const r = await db.eventRegistrant.create({
        data: { eventId: event.id, guestId: guest.id },
      })
      const assigned = await assignBreakoutForRegistrant(r.id, event.id, null, {
        gender: null,
        birthYear: null,
        lifeStageId: singles.id,
      })
      placements.push(assigned?.id ?? "none")
    }

    expect(placements.filter((id) => id === a.id)).toHaveLength(2)
    expect(placements.filter((id) => id === b.id)).toHaveLength(2)
  })

  it("leaves a known-gender registrant on the emptiest-first rule", async () => {
    // Gender did the narrowing already; promoting life stage here would undo the
    // spread fix this file exists to pin.
    const event = await seedEvent()
    const singles = await seedLifeStage("Singles", 1)
    const singlesTable = await seedGroup(event.id, "Singles Table", {
      lifeStageIds: [singles.id],
    })
    await seedGroup(event.id, "Open Table")
    await fill(event.id, singlesTable.id, 4)

    const candidates = await fetchBreakoutCandidates(event.id, null, false)
    expect(
      suggestBreakoutGroup(candidates, {
        gender: "Female",
        birthYear: null,
        lifeStageId: singles.id,
      })?.name
    ).toBe("Open Table")
  })
})
