/**
 * "I want to join a DGroup" registration intent (CCF-101) — payload handling.
 *
 * The intent used to be a client-only UI gate that revealed the matching
 * questions and was dropped on submit. It's a real payload field now, so these
 * pin that it parses, defaults safely, and is gated on the DGroup section like
 * everything else in that step.
 */
import { describe, it, expect } from "vitest"
import { registrantSchema } from "@/lib/validations/event-registrant"
import {
  REGISTRANT_FIELD_GATES,
  sanitizeRegistrantPayload,
} from "@/lib/forms/registration-payload"
import { BARE_EVENT_FORM_CONFIG } from "@/lib/forms/context-config"

describe("DGroup registration intent", () => {
  describe("unit — the intent survives validation and config enforcement", () => {
    it("parses wantsSmallGroup off the registration payload", () => {
      const parsed = registrantSchema.parse({
        firstName: "Maria",
        lastName: "Santos",
        wantsSmallGroup: true,
      })
      expect(parsed.wantsSmallGroup).toBe(true)
    })

    it("defaults to false when the form doesn't send it", () => {
      const parsed = registrantSchema.parse({ firstName: "Maria", lastName: "Santos" })
      expect(parsed.wantsSmallGroup).toBe(false)
    })

    it("treats a null (the sanitizer's 'disabled' value) as not wanting a group", () => {
      const parsed = registrantSchema.parse({
        firstName: "Maria",
        lastName: "Santos",
        wantsSmallGroup: null,
      })
      expect(parsed.wantsSmallGroup).toBe(false)
    })

    it("is gated on the DGroup section, like the rest of that step", () => {
      expect(REGISTRANT_FIELD_GATES.wantsSmallGroup).toBe("sectionSmallGroup")
    })

    it("a crafted intent is dropped when the DGroup section is off", () => {
      const sanitized = sanitizeRegistrantPayload(BARE_EVENT_FORM_CONFIG, {
        wantsSmallGroup: true,
      })
      expect(registrantSchema.parse({
        firstName: "Maria",
        lastName: "Santos",
        ...sanitized,
      }).wantsSmallGroup).toBe(false)
    })

    it("survives sanitizing when the DGroup section is on", () => {
      const sanitized = sanitizeRegistrantPayload(
        { ...BARE_EVENT_FORM_CONFIG, sectionSmallGroup: true },
        { wantsSmallGroup: true }
      )
      expect(sanitized.wantsSmallGroup).toBe(true)
    })
  })
})
