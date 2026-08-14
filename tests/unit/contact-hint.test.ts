import { describe, expect, it } from "vitest"
import { contactHintFrom, maskEmail, maskName, maskPhone } from "@/lib/contact-hint"

// These strings are rendered on public, unauthenticated pages (check-in, catch-mech
// volunteer follow-up), so the assertions here are a privacy boundary: only the last
// four digits and the first letter of an email local part may ever escape.

describe("maskPhone", () => {
  it("keeps only the last four digits of a canonical number", () => {
    expect(maskPhone("+63 917 555 8888")).toBe("+63 ••• ••• 8888")
  })

  it("strips non-digits before taking the last four", () => {
    expect(maskPhone("0917-555-8888")).toBe("+63 ••• ••• 8888")
  })

  it("does not pad a number shorter than four digits", () => {
    expect(maskPhone("917")).toBe("+63 ••• ••• 917")
  })
})

describe("maskEmail", () => {
  it("keeps the first letter and the domain", () => {
    expect(maskEmail("maria.santos@example.com")).toBe("m•••@example.com")
  })

  it("reveals nothing when the value has no domain", () => {
    expect(maskEmail("not-an-email")).toBe("•••")
  })
})

describe("contactHintFrom", () => {
  it("prefers the phone number — it's what people recognise fastest", () => {
    expect(contactHintFrom("+63 917 555 8888", "maria@example.com")).toBe("+63 ••• ••• 8888")
  })

  it("falls back to the email, then to null", () => {
    expect(contactHintFrom(null, "maria@example.com")).toBe("m•••@example.com")
    expect(contactHintFrom(null, null)).toBeNull()
  })
})

describe("maskName", () => {
  it("reduces every word to its initial", () => {
    expect(maskName("Maria", "Santos")).toBe("M••• S•••")
  })

  it("masks middle names and suffixes too — a trailing 'Jr.' is the distinctive part", () => {
    expect(maskName("Juan Miguel", "dela Cruz Jr.")).toBe("J••• M••• d••• C••• J•••")
  })

  it("skips nulls and blanks rather than emitting a stray bullet", () => {
    expect(maskName("Maria", null)).toBe("M•••")
    expect(maskName("  Maria  ", "")).toBe("M•••")
  })

  it("never returns an empty string — an unnamed record still renders as something", () => {
    expect(maskName()).toBe("•••")
    expect(maskName(null, "   ")).toBe("•••")
  })
})
