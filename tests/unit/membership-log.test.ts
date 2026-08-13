import { describe, it, expect, vi } from "vitest"
import {
  logMembershipMove,
  logLeaderChange,
  logGroupStatusChange,
} from "@/lib/small-groups/membership-log"

/**
 * The branching in `logMembershipMove` — which entries a membership change
 * produces — with no DB. A fake tx records what would have been written.
 */

function fakeTx() {
  const created: Record<string, unknown>[] = []
  const tx = {
    smallGroupLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data)
      }),
      createMany: vi.fn(async ({ data }: { data: Record<string, unknown>[] }) => {
        created.push(...data)
      }),
    },
  }
  return { tx, created }
}

// The helper only touches tx.smallGroupLog; the rest of the client is irrelevant.
type Tx = Parameters<typeof logMembershipMove>[0]

const base = { memberId: "m1", memberName: "Ella Santos" }

describe("arriving in a group with no previous one", () => {
  it("writes a single MemberAdded", async () => {
    const { tx, created } = fakeTx()

    await logMembershipMove(tx as unknown as Tx, {
      ...base,
      fromGroupId: null,
      toGroupId: "g-new",
    })

    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({
      smallGroupId: "g-new",
      action: "MemberAdded",
      memberId: "m1",
      description: "Ella Santos was added to the group",
    })
  })
})

describe("leaving without arriving", () => {
  it("writes a single MemberRemoved against the old group", async () => {
    const { tx, created } = fakeTx()

    await logMembershipMove(tx as unknown as Tx, {
      ...base,
      fromGroupId: "g-old",
      toGroupId: null,
    })

    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({
      smallGroupId: "g-old",
      action: "MemberRemoved",
      description: "Ella Santos was removed from the group",
    })
  })
})

describe("moving between two groups", () => {
  it("writes to both sides so neither history has a hole", async () => {
    const { tx, created } = fakeTx()

    await logMembershipMove(tx as unknown as Tx, {
      ...base,
      fromGroupId: "g-old",
      toGroupId: "g-new",
    })

    expect(created).toHaveLength(2)
    expect(created.map((c) => c.smallGroupId).sort()).toEqual(["g-new", "g-old"])
    expect(created.every((c) => c.action === "MemberTransferred")).toBe(true)
  })

  it("carries the same from/to on both entries, whichever group they sit in", async () => {
    const { tx, created } = fakeTx()

    await logMembershipMove(tx as unknown as Tx, {
      ...base,
      fromGroupId: "g-old",
      toGroupId: "g-new",
    })

    for (const entry of created) {
      expect(entry).toMatchObject({ fromGroupId: "g-old", toGroupId: "g-new" })
    }
  })

  it("distinguishes the two directions in the description", async () => {
    const { tx, created } = fakeTx()

    await logMembershipMove(tx as unknown as Tx, {
      ...base,
      fromGroupId: "g-old",
      toGroupId: "g-new",
    })

    const into = created.find((c) => c.smallGroupId === "g-new")
    const outOf = created.find((c) => c.smallGroupId === "g-old")
    expect(into!.description).toBe("Ella Santos transferred into this group")
    expect(outOf!.description).toBe("Ella Santos transferred out of this group")
  })
})

describe("non-events", () => {
  it("writes nothing when the member lands where they already were", async () => {
    const { tx, created } = fakeTx()

    await logMembershipMove(tx as unknown as Tx, {
      ...base,
      fromGroupId: "g-same",
      toGroupId: "g-same",
    })

    expect(created).toHaveLength(0)
  })

  it("writes nothing when there is no group on either side", async () => {
    const { tx, created } = fakeTx()

    await logMembershipMove(tx as unknown as Tx, {
      ...base,
      fromGroupId: null,
      toGroupId: null,
    })

    expect(created).toHaveLength(0)
  })
})

describe("actor and context", () => {
  it("records a dashboard User as the actor", async () => {
    const { tx, created } = fakeTx()

    await logMembershipMove(tx as unknown as Tx, {
      ...base,
      fromGroupId: null,
      toGroupId: "g-new",
      actor: { userId: "user-1" },
    })

    expect(created[0]).toMatchObject({
      performedByUserId: "user-1",
      performedByMemberId: null,
    })
  })

  it("records a Member actor for the token flows, which have no User", async () => {
    const { tx, created } = fakeTx()

    await logMembershipMove(tx as unknown as Tx, {
      ...base,
      fromGroupId: null,
      toGroupId: "g-new",
      actor: { memberId: "leader-1" },
    })

    expect(created[0]).toMatchObject({
      performedByUserId: null,
      performedByMemberId: "leader-1",
    })
  })

  it("appends the context to every entry a move writes", async () => {
    const { tx, created } = fakeTx()

    await logMembershipMove(tx as unknown as Tx, {
      ...base,
      fromGroupId: "g-old",
      toGroupId: "g-new",
      context: "(couple)",
    })

    expect(created).toHaveLength(2)
    expect(created.every((c) => String(c.description).endsWith(" (couple)"))).toBe(true)
  })
})

describe("logLeaderChange", () => {
  it("names both leaders when a group changes hands", async () => {
    const { tx, created } = fakeTx()

    await logLeaderChange(tx as unknown as Tx, {
      smallGroupId: "g1",
      toLeaderId: "m-new",
      toLeaderName: "Nina Reyes",
      fromLeaderId: "m-old",
      fromLeaderName: "Ella Santos",
    })

    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({
      smallGroupId: "g1",
      action: "LeaderChanged",
      // The incoming leader is the subject; the outgoing one has no column.
      memberId: "m-new",
      description: "Nina Reyes took over as leader from Ella Santos",
    })
  })

  it("reads as an appointment when there was no previous leader", async () => {
    const { tx, created } = fakeTx()

    await logLeaderChange(tx as unknown as Tx, {
      smallGroupId: "g1",
      toLeaderId: "m-new",
      toLeaderName: "Nina Reyes",
      fromLeaderId: null,
      fromLeaderName: null,
    })

    expect(created[0].description).toBe("Nina Reyes became the leader")
  })

  it("writes nothing when the leader didn't actually change", async () => {
    const { tx, created } = fakeTx()

    await logLeaderChange(tx as unknown as Tx, {
      smallGroupId: "g1",
      toLeaderId: "m-same",
      toLeaderName: "Nina Reyes",
      fromLeaderId: "m-same",
      fromLeaderName: "Nina Reyes",
    })

    expect(created).toHaveLength(0)
  })

  it("appends the context", async () => {
    const { tx, created } = fakeTx()

    await logLeaderChange(tx as unknown as Tx, {
      smallGroupId: "g1",
      toLeaderId: "m-new",
      toLeaderName: "Nina Reyes",
      fromLeaderId: "m-old",
      fromLeaderName: "Ella Santos",
      context: "(CSV import)",
    })

    expect(created[0].description).toBe(
      "Nina Reyes took over as leader from Ella Santos (CSV import)"
    )
  })
})

describe("logGroupStatusChange", () => {
  it("records the progression in both directions", async () => {
    const { tx, created } = fakeTx()

    await logGroupStatusChange(tx as unknown as Tx, {
      smallGroupId: "g1",
      memberId: "m1",
      memberName: "Ella Santos",
      from: "Member",
      to: "Timothy",
    })

    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({
      smallGroupId: "g1",
      action: "MemberStatusChanged",
      memberId: "m1",
      description: "Ella Santos changed from Member to Timothy",
    })
  })

  it("reads as an initial setting when they had no standing yet", async () => {
    const { tx, created } = fakeTx()

    await logGroupStatusChange(tx as unknown as Tx, {
      smallGroupId: "g1",
      memberId: "m1",
      memberName: "Ella Santos",
      from: null,
      to: "Leader",
    })

    expect(created[0].description).toBe("Ella Santos was set to Leader")
  })

  it("writes nothing when the status is re-selected unchanged", async () => {
    const { tx, created } = fakeTx()

    await logGroupStatusChange(tx as unknown as Tx, {
      smallGroupId: "g1",
      memberId: "m1",
      memberName: "Ella Santos",
      from: "Timothy",
      to: "Timothy",
    })

    expect(created).toHaveLength(0)
  })
})
