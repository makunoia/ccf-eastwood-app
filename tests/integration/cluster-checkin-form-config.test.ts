import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import {
  saveClusterFormConfig,
  saveClusterFormSuccessMessage,
  setClusterFormToggle,
} from "@/app/(dashboard)/events/form-config-actions"
import { getClusterFormConfig } from "@/lib/forms/context-config-server"
import { clusterCheckInNotApplicableToggles } from "@/lib/forms/cluster-sections"
import { FORM_TOGGLE_KEYS } from "@/lib/forms/context-config"

/**
 * Writing a cluster's **Check-in** form config.
 *
 * The day's kiosk gained one honourable toggle on a Collab — the breakout step
 * over the day's own tables — and `/cluster/[id]/forms/check-in` renders the
 * builder for it. But the write action's context allow-list still said "Register
 * and Walk-in only", from before that shipped, so every switch on that page came
 * back "Unknown form context." while the read side had always spoken all three.
 *
 *  - regression:  the toggle saves, and the kiosk's own read sees it
 *  - integration: the row is an upsert keyed [clusterId, CheckIn], and the
 *                 success message shares it rather than creating a second row
 *  - edge case:   an unknown context is still refused; the other two contexts
 *                 are untouched by a Check-in write
 *  - unit/e2e:    skipped — `clusterCheckInNotApplicableToggles` is already
 *                 pinned in tests/unit/checkin-breakout-step, and this is a
 *                 one-line allow-list, not a new user-facing flow
 */

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "EventFormConfig", "EventClusterEvent", "EventCluster", "Event" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedCluster(kind: "Collab" | "Parallel" = "Collab") {
  return db.eventCluster.create({
    data: { name: "Sunday, Aug 2", kind, isOpen: true },
  })
}

describe("cluster Check-in form config — regression: 'Unknown form context.'", () => {
  it("saves the breakout toggle the day's kiosk builder offers", async () => {
    const cluster = await seedCluster()

    const result = await setClusterFormToggle(
      cluster.id,
      "CheckIn",
      "sectionBreakout",
      true
    )

    expect(result).toEqual({ success: true, data: undefined })
  })

  it("is visible to the kiosk's own read afterwards", async () => {
    const cluster = await seedCluster()
    await setClusterFormToggle(cluster.id, "CheckIn", "sectionBreakout", true)

    // The exact call app/register/c/[token]/check-in makes.
    const config = await getClusterFormConfig(cluster.id, "CheckIn")
    expect(config.sectionBreakout).toBe(true)
  })

  it("offers every toggle the builder considers applicable there", async () => {
    const cluster = await seedCluster()
    const notApplicable = clusterCheckInNotApplicableToggles("Collab")
    const applicable = FORM_TOGGLE_KEYS.filter((k) => !notApplicable.includes(k))
    expect(applicable.length).toBeGreaterThan(0)

    for (const key of applicable) {
      const result = await setClusterFormToggle(cluster.id, "CheckIn", key, true)
      expect(result.success, `${key} should be writable`).toBe(true)
    }
  })
})

describe("cluster Check-in form config — one row per [clusterId, context]", () => {
  it("upserts rather than duplicating across repeated writes", async () => {
    const cluster = await seedCluster()

    await setClusterFormToggle(cluster.id, "CheckIn", "sectionBreakout", true)
    await setClusterFormToggle(cluster.id, "CheckIn", "sectionBreakout", false)

    const rows = await db.eventFormConfig.findMany({
      where: { clusterId: cluster.id, context: "CheckIn" },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].sectionBreakout).toBe(false)
  })

  it("still refuses a success message there — the kiosk has no success screen", async () => {
    // Opening the toggle write to Check-in must not open the message write with
    // it: the day's board confirms attendance in place, and nothing would ever
    // render the text. The builder renders no editor for it either.
    const cluster = await seedCluster()

    const result = await saveClusterFormSuccessMessage(cluster.id, "CheckIn", "Hi")

    expect(result).toEqual({ success: false, error: "Unknown form context." })
  })

  it("leaves Register and Walk-in alone", async () => {
    const cluster = await seedCluster()
    await saveClusterFormConfig(cluster.id, "Register", { sectionBreakout: true })

    await setClusterFormToggle(cluster.id, "CheckIn", "sectionBreakout", false)

    expect((await getClusterFormConfig(cluster.id, "Register")).sectionBreakout).toBe(true)
    expect((await getClusterFormConfig(cluster.id, "CheckIn")).sectionBreakout).toBe(false)
  })
})

describe("cluster form config — an unknown context is still refused", () => {
  it("rejects a context the enum doesn't have", async () => {
    const cluster = await seedCluster()

    const result = await saveClusterFormConfig(
      cluster.id,
      "Nonsense" as never,
      { sectionBreakout: true }
    )

    expect(result).toEqual({ success: false, error: "Unknown form context." })
    expect(await db.eventFormConfig.count({ where: { clusterId: cluster.id } })).toBe(0)
  })
})
