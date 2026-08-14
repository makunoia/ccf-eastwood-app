import { describe, it, expect } from "vitest"
import { displayPersonName, personNameKey, personNameTokens } from "@/lib/people/name-key"

describe("personNameTokens", () => {
  it("lowercases and splits on whitespace", () => {
    expect(personNameTokens("Maria", "Santos")).toEqual(["maria", "santos"])
  })

  it("strips accents", () => {
    expect(personNameTokens("Niño", "Peña")).toEqual(["nino", "pena"])
  })

  it("treats punctuation as a separator", () => {
    expect(personNameTokens("O'Brien-Cruz", "Jr.")).toEqual(["o", "brien", "cruz", "jr"])
  })

  it("collapses stray whitespace", () => {
    expect(personNameTokens("  Juan   ", " dela  Cruz ")).toEqual(["juan", "dela", "cruz"])
  })

  it("ignores null, undefined, and blank parts", () => {
    expect(personNameTokens("Maria", null, "", undefined, "Santos")).toEqual(["maria", "santos"])
  })
})

describe("personNameKey", () => {
  it("matches the same name typed with different case and spacing", () => {
    expect(personNameKey("Maria", "Santos")).toBe(personNameKey("  maria", "SANTOS "))
  })

  it("matches a first/last swap", () => {
    expect(personNameKey("Santos", "Maria")).toBe(personNameKey("Maria", "Santos"))
  })

  it("matches a full name pasted into the first-name column", () => {
    expect(personNameKey("Maria Santos", "")).toBe(personNameKey("Maria", "Santos"))
  })

  it("matches across accent spelling", () => {
    expect(personNameKey("Niño", "Peña")).toBe(personNameKey("Nino", "Pena"))
  })

  it("keeps a generational suffix distinct — Jr is a different person", () => {
    expect(personNameKey("Juan", "Cruz Jr.")).not.toBe(personNameKey("Juan", "Cruz"))
  })

  it("does not match on a shared first name alone", () => {
    expect(personNameKey("Maria", "Santos")).not.toBe(personNameKey("Maria", "Reyes"))
  })

  it("returns null for a single-token name", () => {
    expect(personNameKey("Maria", "")).toBeNull()
    expect(personNameKey("Maria", null)).toBeNull()
  })

  it("returns null when there is no name at all", () => {
    expect(personNameKey("", "")).toBeNull()
  })

  it("returns null for punctuation-only input", () => {
    expect(personNameKey("--", ".")).toBeNull()
  })
})

describe("displayPersonName", () => {
  it("keeps the spelling as typed and tidies whitespace", () => {
    expect(displayPersonName("  Juan ", " dela  Cruz")).toBe("Juan dela Cruz")
  })

  it("skips blank parts", () => {
    expect(displayPersonName("Maria", "")).toBe("Maria")
  })
})
