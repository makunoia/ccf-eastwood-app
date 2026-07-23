import { describe, it, expect } from "vitest"
import { isWithinRegistrationWindow } from "@/lib/events/registration-window"

const now = new Date("2026-07-23T12:00:00Z")

describe("isWithinRegistrationWindow", () => {
  it("is open when both bounds are null", () => {
    expect(isWithinRegistrationWindow(null, null, now)).toBe(true)
  })

  it("is open inside the window", () => {
    expect(
      isWithinRegistrationWindow(new Date("2026-07-01"), new Date("2026-08-01"), now)
    ).toBe(true)
  })

  it("is closed before the open date", () => {
    expect(
      isWithinRegistrationWindow(new Date("2026-07-24"), null, now)
    ).toBe(false)
  })

  it("is closed after the close date", () => {
    expect(
      isWithinRegistrationWindow(null, new Date("2026-07-22"), now)
    ).toBe(false)
  })

  it("open date only, already open", () => {
    expect(isWithinRegistrationWindow(new Date("2026-07-01"), null, now)).toBe(true)
  })

  it("close date only, not yet closed", () => {
    expect(isWithinRegistrationWindow(null, new Date("2026-08-01"), now)).toBe(true)
  })

  it("treats undefined bounds like null (unbounded)", () => {
    expect(isWithinRegistrationWindow(undefined, undefined, now)).toBe(true)
  })

  it("is open exactly at the open instant (inclusive)", () => {
    expect(isWithinRegistrationWindow(now, null, now)).toBe(true)
  })

  it("is open exactly at the close instant (inclusive)", () => {
    expect(isWithinRegistrationWindow(null, now, now)).toBe(true)
  })
})
