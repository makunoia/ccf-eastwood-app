import { describe, expect, it } from "vitest"

import { eventVolunteerColumns } from "@/lib/exports/event-volunteers"
import {
  buildClusterVolunteerColumns,
  buildClusterVolunteersTable,
  clusterVolunteerColumns,
  type ClusterVolunteerExportRow,
} from "@/lib/exports/cluster-volunteers"

/**
 * The day's volunteer export is the event's registry plus one column.
 *
 * Pinned because the reuse is the whole point: a second hand-written copy of the
 * volunteer columns would drift the first time a field was added to one of them,
 * and an export from the day would stop round-tripping through the importer that
 * an export from either ministry's event still passes.
 */

function row(over: Partial<ClusterVolunteerExportRow> = {}): ClusterVolunteerExportRow {
  return {
    volunteerId: "v1",
    ministry: "Youth",
    firstName: "Maria",
    lastName: "Cruz",
    nickname: null,
    email: null,
    phone: "+63 917 111 2222",
    lifeStage: null,
    gender: null,
    birthDate: null,
    smallGroup: null,
    committeeName: "Ushering",
    preferredRole: "Greeter",
    assignedRole: null,
    status: "Pending",
    notes: null,
    leaderNotes: null,
    signedUpAt: "2026-09-05T02:00:00.000Z",
    bus: null,
    busDirection: null,
    ...over,
  }
}

describe("cluster volunteer export columns", () => {
  it("carries every event volunteer column through unchanged", () => {
    const inherited = eventVolunteerColumns().map((c) => c.key)
    const keys = clusterVolunteerColumns().map((c) => c.key)
    for (const key of inherited) expect(keys).toContain(key)
    expect(keys).toHaveLength(inherited.length + 1)
  })

  it("adds Ministry at the head of the Serving group", () => {
    const serving = clusterVolunteerColumns().filter((c) => c.group === "Serving")
    expect(serving[0].key).toBe("ministry")
    expect(serving[0].label).toBe("Signed Up Under")
  })

  it("offers the ministry column when the rows carry one", () => {
    const offered = buildClusterVolunteerColumns([], [row()]).map((c) => c.key)
    expect(offered).toContain("ministry")
  })

  it("drops the ministry column when no row names one", () => {
    // `optional`, so it is offered when populated and never flagged "no longer
    // asked" — nobody was ever asked which ministry they serve; it is derived.
    const offered = buildClusterVolunteerColumns([], [row({ ministry: "" })]).map(
      (c) => c.key,
    )
    expect(offered).not.toContain("ministry")
  })

  it("keeps a bus column when any of the day's events has Embarkation", () => {
    // Union across the day: the value belongs to the row's own event, and gating
    // on one ministry's modules would drop the other ministry's assignments.
    const offered = buildClusterVolunteerColumns(["Embarkation"], [row()])
    expect(offered.find((c) => c.key === "bus")?.collected).toBe(true)
  })

  it("exports the chosen columns in registry order, not tick order", () => {
    const { headers, cells } = buildClusterVolunteersTable(
      [row({ ministry: "Singles", firstName: "Jon" })],
      ["status", "ministry", "firstName"],
    )
    expect(headers).toEqual(["First Name", "Signed Up Under", "Status"])
    expect(cells).toEqual([["Jon", "Singles", "Pending"]])
  })
})
