/**
 * Registration success-screen copy (CCF-130) — pure resolution and fallback.
 *
 * The stock copy invites people to bring a friend, which is the wrong message for
 * an invite-only event, so it's overridable per (event, context). These pin that a
 * blank override always falls back and that the defaults themselves don't drift.
 */
import { describe, it, expect } from "vitest"
import {
  defaultSuccessMessage,
  resolveSuccessMessage,
} from "@/lib/forms/context-config"

const CUSTOM = "You're on the list. This one's invite-only, so please don't share the link."

describe("registration success message", () => {
  describe("unit — copy resolution and fallback", () => {
    it("falls back to the event-named default when nothing is configured", () => {
      expect(resolveSuccessMessage(null, "Register", "Youth Camp")).toBe(
        "You're all set for Youth Camp. We're so glad you're coming — feel free to bring a friend!"
      )
    })

    it("falls back to the generic default when there is no event name", () => {
      expect(resolveSuccessMessage(null, "Register")).toBe(
        "You're all set! We're so glad you're joining us. Feel free to bring a friend — see you soon!"
      )
    })

    it("keeps the walk-in default distinct — someone at the door has already arrived", () => {
      expect(resolveSuccessMessage(null, "WalkIn", "Youth Camp")).toBe(
        "You're registered and checked in. Enjoy the event!"
      )
      expect(defaultSuccessMessage("WalkIn")).not.toContain("bring a friend")
    })

    it("uses the configured copy when one is set", () => {
      expect(resolveSuccessMessage(CUSTOM, "Register", "Youth Camp")).toBe(CUSTOM)
    })

    it("treats a blank or whitespace-only stored value as unset", () => {
      const fallback = defaultSuccessMessage("Register", "Youth Camp")
      expect(resolveSuccessMessage("", "Register", "Youth Camp")).toBe(fallback)
      expect(resolveSuccessMessage("   \n ", "Register", "Youth Camp")).toBe(fallback)
      expect(resolveSuccessMessage(undefined, "Register", "Youth Camp")).toBe(fallback)
    })

    it("trims surrounding whitespace off configured copy", () => {
      expect(resolveSuccessMessage(`  ${CUSTOM}  `, "Register")).toBe(CUSTOM)
    })

    it("the default copy still invites a friend — existing events are unchanged", () => {
      expect(defaultSuccessMessage("Register", "Youth Camp")).toContain("bring a friend")
      expect(defaultSuccessMessage("Register")).toContain("bring a friend")
    })
  })
})
