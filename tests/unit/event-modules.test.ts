import { describe, expect, it } from "vitest"
import {
  availableModules,
  blockingDependents,
  formatModuleList,
  isModuleAvailable,
  modulesToEnable,
  MODULE_REQUIRES,
} from "@/lib/events/modules"

describe("modulesToEnable", () => {
  it("returns just the target when it has no requirements", () => {
    expect(modulesToEnable("Baptism", [])).toEqual(["Baptism"])
  })

  it("pulls in a direct requirement", () => {
    expect(modulesToEnable("Breakout", [])).toEqual(["Volunteers", "Breakout"])
  })

  it("pulls in the transitive closure — Catch Mech needs Breakout, which needs Volunteers", () => {
    const result = modulesToEnable("CatchMech", [])
    expect(result).toContain("Volunteers")
    expect(result).toContain("Breakout")
    expect(result).toContain("CatchMech")
    // Requirements must be listed before the module that needs them.
    expect(result.indexOf("Volunteers")).toBeLessThan(result.indexOf("Breakout"))
    expect(result.indexOf("Breakout")).toBeLessThan(result.indexOf("CatchMech"))
  })

  it("omits requirements that are already enabled", () => {
    expect(modulesToEnable("CatchMech", ["Volunteers"])).toEqual(["Breakout", "CatchMech"])
    expect(modulesToEnable("Breakout", ["Volunteers"])).toEqual(["Breakout"])
  })

  it("returns an empty list when the target is already enabled", () => {
    expect(modulesToEnable("Breakout", ["Volunteers", "Breakout"])).toEqual([])
  })

  it("enabling Embarkation pulls in Volunteers but not Breakout", () => {
    expect(modulesToEnable("Embarkation", [])).toEqual(["Volunteers", "Embarkation"])
  })
})

describe("blockingDependents", () => {
  it("is empty when nothing depends on the target", () => {
    expect(blockingDependents("Volunteers", ["Volunteers", "Baptism"])).toEqual([])
  })

  it("reports the enabled module that requires the target", () => {
    expect(blockingDependents("Volunteers", ["Volunteers", "Breakout"])).toEqual(["Breakout"])
    expect(blockingDependents("Breakout", ["Volunteers", "Breakout", "CatchMech"])).toEqual([
      "CatchMech",
    ])
  })

  it("reports every direct dependent", () => {
    const blockers = blockingDependents("Volunteers", [
      "Volunteers",
      "Breakout",
      "Embarkation",
      "CatchMech",
    ])
    expect(blockers.sort()).toEqual(["Breakout", "CatchMech", "Embarkation"])
  })

  it("ignores dependents that are not enabled", () => {
    expect(blockingDependents("Volunteers", ["Volunteers"])).toEqual([])
  })

  it("never reports the target as its own blocker", () => {
    expect(blockingDependents("Breakout", ["Breakout"])).toEqual([])
  })
})

describe("isModuleAvailable", () => {
  it("offers every module to OneTime and MultiDay events", () => {
    for (const type of Object.keys(MODULE_REQUIRES) as Array<keyof typeof MODULE_REQUIRES>) {
      expect(isModuleAvailable(type, "OneTime")).toBe(true)
      expect(isModuleAvailable(type, "MultiDay")).toBe(true)
    }
  })

  it("withholds Priced and Embarkation from Recurring events", () => {
    expect(isModuleAvailable("Priced", "Recurring")).toBe(false)
    expect(isModuleAvailable("Embarkation", "Recurring")).toBe(false)
  })

  it("still offers Volunteers, Breakout, and Catch Mech to Recurring events", () => {
    expect(isModuleAvailable("Volunteers", "Recurring")).toBe(true)
    expect(isModuleAvailable("Breakout", "Recurring")).toBe(true)
    expect(isModuleAvailable("CatchMech", "Recurring")).toBe(true)
  })

  it("availableModules mirrors isModuleAvailable", () => {
    expect(availableModules("Recurring")).not.toContain("Priced")
    expect(availableModules("OneTime")).toContain("Priced")
  })
})

describe("formatModuleList", () => {
  it("renders one, two, and three modules readably", () => {
    expect(formatModuleList([])).toBe("")
    expect(formatModuleList(["CatchMech"])).toBe("Catch Mech")
    expect(formatModuleList(["Breakout", "CatchMech"])).toBe("Breakout Groups and Catch Mech")
    expect(formatModuleList(["Breakout", "Embarkation", "CatchMech"])).toBe(
      "Breakout Groups, Embarkation and Catch Mech"
    )
  })
})
