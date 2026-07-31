/**
 * A registrant whose DGroup meets at another CCF satellite can now say so.
 * `Guest.claimedSatellite` is the answer with no local group to point at — it
 * must persist through registration, stay mutually exclusive with
 * `claimedSmallGroupId`, and count as "already in a DGroup" everywhere the
 * absence of a claimed group triggers a follow-up.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { db } from "@/lib/db"
import {
  createRegistrant,
  lookupCheckinRegistrant,
} from "@/app/(dashboard)/events/actions"
import {
  saveGuestClaimedGroup,
  clearGuestClaimedGroup,
} from "@/app/(dashboard)/guests/actions"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "u1", role: "SuperAdmin" } })),
}))

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "Member", "Guest", "SmallGroup", "SmallGroupMemberRequest", "Event", "EventRegistrant", "EventFormConfig" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedEventWithSmallGroupSection(name = "Youth Camp") {
  const event = await db.event.create({
    data: {
      name,
      type: "OneTime",
      startDate: new Date("2026-08-01"),
      endDate: new Date("2026-08-01"),
    },
  })
  await db.eventFormConfig.create({
    data: { eventId: event.id, context: "Register", sectionSmallGroup: true },
  })
  return event
}

describe("public registration — claimed satellite", () => {
  it("stores the satellite on a brand-new guest", async () => {
    const event = await seedEventWithSmallGroupSection()

    const res = await createRegistrant(
      event.id,
      {
        firstName: "Maria",
        lastName: "Santos",
        mobileNumber: "09171234567",
        claimedSatellite: "CCF Cebu",
      },
      null
    )
    expect(res.success).toBe(true)

    const guest = await db.guest.findFirstOrThrow({ where: { lastName: "Santos" } })
    expect(guest.claimedSatellite).toBe("CCF Cebu")
    expect(guest.claimedSmallGroupId).toBeNull()
  })

  it("keeps the satellite and drops a stale group id sent alongside it", async () => {
    const event = await seedEventWithSmallGroupSection()
    const leader = await db.member.create({
      data: { firstName: "Juan", lastName: "Cruz", dateJoined: new Date(), language: [] },
    })
    const group = await db.smallGroup.create({
      data: { name: "Ortigas Young Pro", leaderId: leader.id, language: [] },
    })

    const res = await createRegistrant(
      event.id,
      {
        firstName: "Maria",
        lastName: "Santos",
        mobileNumber: "09171234567",
        claimedSmallGroupId: group.id,
        claimedSatellite: "CCF Davao",
      },
      null
    )
    expect(res.success).toBe(true)

    const guest = await db.guest.findFirstOrThrow({ where: { lastName: "Santos" } })
    expect(guest.claimedSatellite).toBe("CCF Davao")
    expect(guest.claimedSmallGroupId).toBeNull()
  })

  it("rejects a satellite that isn't on the Philippine list", async () => {
    const event = await seedEventWithSmallGroupSection()

    const res = await createRegistrant(
      event.id,
      {
        firstName: "Maria",
        lastName: "Santos",
        mobileNumber: "09171234567",
        claimedSatellite: "CCF Singapore",
      },
      null
    )
    expect(res.success).toBe(false)
    expect(await db.guest.count()).toBe(0)
  })

  it("does not store the satellite when the DGroup section is off", async () => {
    // No EventFormConfig row — the bare form, DGroup section disabled. A crafted
    // POST must not be able to write a field the admin turned off.
    const event = await db.event.create({
      data: {
        name: "Bare Event",
        type: "OneTime",
        startDate: new Date("2026-08-01"),
        endDate: new Date("2026-08-01"),
      },
    })

    const res = await createRegistrant(
      event.id,
      {
        firstName: "Maria",
        lastName: "Santos",
        mobileNumber: "09171234567",
        claimedSatellite: "CCF Cebu",
      },
      null
    )
    expect(res.success).toBe(true)

    const guest = await db.guest.findFirstOrThrow({ where: { lastName: "Santos" } })
    expect(guest.claimedSatellite).toBeNull()
  })

  it("fills the satellite onto a deduplicated guest who had no answer yet", async () => {
    const event = await seedEventWithSmallGroupSection()
    await db.guest.create({
      data: {
        firstName: "Maria",
        lastName: "Santos",
        phone: "+63 917 123 4567",
        language: [],
      },
    })

    const res = await createRegistrant(
      event.id,
      {
        firstName: "Maria",
        lastName: "Santos",
        mobileNumber: "09171234567",
        claimedSatellite: "CCF Iloilo",
      },
      null
    )
    expect(res.success).toBe(true)

    expect(await db.guest.count()).toBe(1)
    const guest = await db.guest.findFirstOrThrow({ where: { lastName: "Santos" } })
    expect(guest.claimedSatellite).toBe("CCF Iloilo")
  })

  it("replaces an earlier claimed group when a deduplicated guest re-answers", async () => {
    // The anonymous dedup path treats each submission as the freshest answer —
    // pre-existing behavior for every matching field. What matters here is that
    // the swap is clean: the group link goes when the satellite arrives.
    const event = await seedEventWithSmallGroupSection()
    const leader = await db.member.create({
      data: { firstName: "Juan", lastName: "Cruz", dateJoined: new Date(), language: [] },
    })
    const group = await db.smallGroup.create({
      data: { name: "Ortigas Young Pro", leaderId: leader.id, language: [] },
    })
    await db.guest.create({
      data: {
        firstName: "Maria",
        lastName: "Santos",
        phone: "+63 917 123 4567",
        language: [],
        claimedSmallGroupId: group.id,
      },
    })

    await createRegistrant(
      event.id,
      {
        firstName: "Maria",
        lastName: "Santos",
        mobileNumber: "09171234567",
        claimedSatellite: "CCF Iloilo",
      },
      null
    )

    const guest = await db.guest.findFirstOrThrow({ where: { lastName: "Santos" } })
    expect(guest.claimedSatellite).toBe("CCF Iloilo")
    expect(guest.claimedSmallGroupId).toBeNull()
  })

  it("leaves a confirmed guest's earlier answer alone", async () => {
    // The confirmed-guest path is fill-if-null: someone who already told us
    // where they belong is not re-written by a later form.
    const event = await seedEventWithSmallGroupSection()
    const leader = await db.member.create({
      data: { firstName: "Juan", lastName: "Cruz", dateJoined: new Date(), language: [] },
    })
    const group = await db.smallGroup.create({
      data: { name: "Ortigas Young Pro", leaderId: leader.id, language: [] },
    })
    const guest = await db.guest.create({
      data: {
        firstName: "Maria",
        lastName: "Santos",
        phone: "+63 917 123 4567",
        language: [],
        claimedSmallGroupId: group.id,
      },
    })

    await createRegistrant(
      event.id,
      {
        firstName: "Maria",
        lastName: "Santos",
        mobileNumber: "09171234567",
        claimedSatellite: "CCF Iloilo",
      },
      null,
      guest.id
    )

    const updated = await db.guest.findUniqueOrThrow({ where: { id: guest.id } })
    expect(updated.claimedSmallGroupId).toBe(group.id)
    expect(updated.claimedSatellite).toBeNull()
  })

  it("fills a confirmed guest's satellite when they had no answer yet", async () => {
    const event = await seedEventWithSmallGroupSection()
    const guest = await db.guest.create({
      data: {
        firstName: "Maria",
        lastName: "Santos",
        phone: "+63 917 123 4567",
        language: [],
      },
    })

    await createRegistrant(
      event.id,
      {
        firstName: "Maria",
        lastName: "Santos",
        mobileNumber: "09171234567",
        claimedSatellite: "CCF Baguio",
      },
      null,
      guest.id
    )

    const updated = await db.guest.findUniqueOrThrow({ where: { id: guest.id } })
    expect(updated.claimedSatellite).toBe("CCF Baguio")
  })
})

describe("check-in DGroup prompt", () => {
  async function seedCheckedInGuest(guestData: Record<string, unknown>) {
    const event = await db.event.create({
      data: {
        name: "Sunday Service",
        type: "OneTime",
        startDate: new Date("2026-08-01"),
        endDate: new Date("2026-08-01"),
      },
    })
    const guest = await db.guest.create({
      data: { firstName: "Maria", lastName: "Santos", phone: "+63 917 123 4567", language: [], ...guestData },
    })
    await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })
    return { event, guest }
  }

  it("asks a guest who has claimed nothing", async () => {
    const { event } = await seedCheckedInGuest({})

    const res = await lookupCheckinRegistrant(event.id, "+63 917 123 4567", null)
    expect(res.success).toBe(true)
    if (!res.success) return
    expect((res.data as { guestSmallGroupPrompt: unknown }).guestSmallGroupPrompt).not.toBeNull()
  })

  it("stays quiet for a guest whose DGroup is at another satellite", async () => {
    // They already told us they're in a DGroup — there's just no local group to
    // link. Asking again would treat them as unconnected.
    const { event } = await seedCheckedInGuest({ claimedSatellite: "CCF Cebu" })

    const res = await lookupCheckinRegistrant(event.id, "+63 917 123 4567", null)
    expect(res.success).toBe(true)
    if (!res.success) return
    expect((res.data as { guestSmallGroupPrompt: unknown }).guestSmallGroupPrompt).toBeNull()
  })
})

describe("admin claimed-group actions vs. claimed satellite", () => {
  it("naming one of our groups supersedes the satellite answer", async () => {
    const leader = await db.member.create({
      data: { firstName: "Juan", lastName: "Cruz", dateJoined: new Date(), language: [] },
    })
    const group = await db.smallGroup.create({
      data: { name: "Ortigas Young Pro", leaderId: leader.id, language: [] },
    })
    const guest = await db.guest.create({
      data: { firstName: "Maria", lastName: "Santos", language: [], claimedSatellite: "CCF Cebu" },
    })

    const res = await saveGuestClaimedGroup(guest.id, group.id)
    expect(res.success).toBe(true)

    const updated = await db.guest.findUniqueOrThrow({ where: { id: guest.id } })
    expect(updated.claimedSmallGroupId).toBe(group.id)
    expect(updated.claimedSatellite).toBeNull()
  })

  it("clearing the claimed group also clears a claimed satellite", async () => {
    const guest = await db.guest.create({
      data: { firstName: "Maria", lastName: "Santos", language: [], claimedSatellite: "CCF Cebu" },
    })

    const res = await clearGuestClaimedGroup(guest.id)
    expect(res.success).toBe(true)

    const updated = await db.guest.findUniqueOrThrow({ where: { id: guest.id } })
    expect(updated.claimedSatellite).toBeNull()
  })
})
