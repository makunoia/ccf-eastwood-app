// @vitest-environment jsdom
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { db } from "@/lib/db"
import EventDashboardPage from "@/app/(event)/event/[id]/dashboard/page"

/**
 * Regression: a MultiDay dashboard used to run the whole dashboard query twice.
 *
 * `ensureMultiDayOccurrences` was called *after* the query, so the page had to
 * re-run it to see the occurrences it had just created — and that query is the
 * most expensive statement on the page, with deeply nested selects over every
 * registrant. Generating the occurrences first makes one pass enough.
 *
 * jsdom because the page imports the client component; nothing here renders it.
 */

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound")
  },
  usePathname: () => "/event/evt-1/dashboard",
  useRouter: () => ({ refresh: vi.fn() }),
}))

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "EventDashboardWidget", "OccurrenceAttendee", "EventOccurrence", "EventModule", "Event" RESTART IDENTITY CASCADE`
})

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(async () => {
  await db.$disconnect()
})

async function makeMultiDayEvent() {
  return db.event.create({
    data: {
      name: "Conference",
      type: "MultiDay",
      // Three consecutive days → three occurrences.
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-03-03T00:00:00.000Z"),
    },
  })
}

/** Render the page's data layer and hand back the props it built. */
async function loadDashboard(eventId: string) {
  const element = (await EventDashboardPage({
    params: Promise.resolve({ id: eventId }),
    searchParams: Promise.resolve({}),
  })) as { props: { event: { occurrenceCount: number; type: string } } }
  return element.props
}

describe("MultiDay dashboard", () => {
  it("generates the day occurrences", async () => {
    const event = await makeMultiDayEvent()
    await loadDashboard(event.id)

    const occurrences = await db.eventOccurrence.findMany({ where: { eventId: event.id } })
    expect(occurrences).toHaveLength(3)
  })

  it("counts those occurrences on the first pass, with no second query needed", async () => {
    const event = await makeMultiDayEvent()
    const { event: payload } = await loadDashboard(event.id)

    // The occurrences were created during this same render — if the ordering
    // regressed, this would read 0 without a repeat query to correct it.
    expect(payload.occurrenceCount).toBe(3)
    expect(payload.type).toBe("MultiDay")
  })

  it("regression: runs the expensive dashboard query exactly once", async () => {
    const event = await makeMultiDayEvent()
    const findUnique = vi.spyOn(db.event, "findUnique")

    await loadDashboard(event.id)

    // Two lookups total: the small type/date/modules one that has to come first,
    // and the single full dashboard query. Three would mean the double fetch is
    // back.
    expect(findUnique).toHaveBeenCalledTimes(2)

    const selects = findUnique.mock.calls.map(
      (call) => Object.keys(call[0]?.select ?? {}).length
    )
    // The gating lookup is the small one, and it runs first.
    expect(selects[0]).toBeLessThan(selects[1])
  })

  it("is idempotent — a second load creates no duplicate occurrences", async () => {
    const event = await makeMultiDayEvent()
    await loadDashboard(event.id)
    await loadDashboard(event.id)

    expect(await db.eventOccurrence.count({ where: { eventId: event.id } })).toBe(3)
  })

  it("leaves a OneTime event's occurrence generation alone", async () => {
    const event = await db.event.create({
      data: {
        name: "Single",
        type: "OneTime",
        startDate: new Date("2026-03-01T00:00:00.000Z"),
        endDate: new Date("2026-03-03T00:00:00.000Z"),
      },
    })
    await loadDashboard(event.id)

    expect(await db.eventOccurrence.count({ where: { eventId: event.id } })).toBe(0)
  })
})
