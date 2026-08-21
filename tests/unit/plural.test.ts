import { describe, expect, it } from "vitest"

import { plural } from "@/lib/format/plural"

/**
 * The rule that used to be copy-pasted into three files, each assuming `+ "s"`
 * covers every noun. It doesn't — which is what the `many` argument is for.
 */
describe("plural", () => {
  it("uses the singular for exactly one", () => {
    expect(plural(1, "event")).toBe("1 event")
  })

  it("uses the plural for zero and for many", () => {
    expect(plural(0, "event")).toBe("0 events")
    expect(plural(24, "event")).toBe("24 events")
  })

  it("takes an irregular plural rather than deriving one", () => {
    expect(plural(2, "family", "families")).toBe("2 families")
    expect(plural(1, "family", "families")).toBe("1 family")
    expect(plural(3, "person", "people")).toBe("3 people")
  })

  it("leaves a hyphenated noun intact", () => {
    expect(plural(2, "check-in")).toBe("2 check-ins")
  })
})
