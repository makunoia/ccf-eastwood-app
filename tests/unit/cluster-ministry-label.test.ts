import { describe, expect, it } from "vitest"

import {
  clusterEventMinistry,
  clusterEventMinistryLabel,
} from "@/lib/clusters/ministry-label"

/**
 * The rule a Collab day's "which ministry are you part of?" question rests on.
 *
 * It was written out at three call sites — the shared registration form, the
 * shared volunteer form, and cluster Settings, which warns when the question has
 * no answer. Pinned here now that a fourth (the admin add-volunteer form) reads
 * it, because the failure mode of three copies is the public form offering a
 * choice Settings has already declared impossible.
 *
 * Unit only: pure, no DB, no React.
 */

const ministry = { id: "m1", name: "Youth" }

describe("clusterEventMinistry", () => {
  it("returns the one ministry behind an event", () => {
    expect(
      clusterEventMinistry({ allMinistries: false, ministries: [{ ministry }] }),
    ).toEqual(ministry)
  })

  it("returns null when the event names no ministry", () => {
    expect(clusterEventMinistry({ allMinistries: false, ministries: [] })).toBeNull()
  })

  it("returns null when the event names several", () => {
    expect(
      clusterEventMinistry({
        allMinistries: false,
        ministries: [{ ministry }, { ministry: { id: "m2", name: "Singles" } }],
      }),
    ).toBeNull()
  })

  it("returns null for allMinistries even when exactly one is listed", () => {
    // The edge that makes this worth a helper: `ministries.length === 1` alone
    // reads true here, and an event serving *every* ministry cannot be the answer
    // to "which ministry are you part of?".
    expect(
      clusterEventMinistry({ allMinistries: true, ministries: [{ ministry }] }),
    ).toBeNull()
  })
})

describe("clusterEventMinistryLabel", () => {
  it("labels the event with its ministry's name", () => {
    expect(
      clusterEventMinistryLabel({
        name: "Youth Night",
        allMinistries: false,
        ministries: [{ ministry }],
      }),
    ).toBe("Youth")
  })

  it("falls back to the event's own name rather than dead-ending the form", () => {
    // A day that slipped past `collabMinistryProblems` still has to be fillable.
    expect(
      clusterEventMinistryLabel({
        name: "Youth Night",
        allMinistries: false,
        ministries: [],
      }),
    ).toBe("Youth Night")
  })
})
