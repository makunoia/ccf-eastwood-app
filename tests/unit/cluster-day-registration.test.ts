import { describe, expect, it } from "vitest"

import { clusterDayRegistrationDisposition } from "@/lib/clusters/day-registration"

/**
 * What an existing `EventRegistrant` row means when someone submits a cluster's
 * shared form.
 *
 * The rule this pins: a **Collab** day owns its registrant list, so it starts
 * fresh. A row on one of the member events — which is one row per person per
 * event *series*, and so predates the day for every regular of either ministry —
 * is not a registration for the day, and must not short-circuit the submission.
 * A **Parallel** day is the opposite: the person ticked that event, so its own
 * registration is exactly the thing being asked about.
 */

const CLUSTER = "cluster-1"

describe("clusterDayRegistrationDisposition", () => {
  it("creates when the person holds no registration on the event", () => {
    expect(clusterDayRegistrationDisposition(true, null, CLUSTER)).toBe("create")
    expect(clusterDayRegistrationDisposition(false, null, CLUSTER)).toBe("create")
  })

  it("reuses a Collab member event's pre-existing row rather than counting it", () => {
    // The Youth regular: a row made long before this day existed.
    expect(
      clusterDayRegistrationDisposition(true, { registrationClusterId: null }, CLUSTER)
    ).toBe("reuse")
  })

  it("reuses a row stamped for a different day", () => {
    expect(
      clusterDayRegistrationDisposition(true, { registrationClusterId: "cluster-2" }, CLUSTER)
    ).toBe("reuse")
  })

  it("stops at already once the row belongs to this day", () => {
    // Idempotence: submitting the collab form twice must not re-file placement.
    expect(
      clusterDayRegistrationDisposition(true, { registrationClusterId: CLUSTER }, CLUSTER)
    ).toBe("already")
  })

  it("leaves a Parallel day reading any existing registration as already", () => {
    expect(
      clusterDayRegistrationDisposition(false, { registrationClusterId: null }, CLUSTER)
    ).toBe("already")
    expect(
      clusterDayRegistrationDisposition(false, { registrationClusterId: CLUSTER }, CLUSTER)
    ).toBe("already")
    expect(
      clusterDayRegistrationDisposition(false, { registrationClusterId: "cluster-2" }, CLUSTER)
    ).toBe("already")
  })
})
