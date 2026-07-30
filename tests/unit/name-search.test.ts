import { describe, it, expect } from "vitest"
import {
  MAX_SEARCH_TOKENS,
  PERSON_NAME_FIELDS,
  PERSON_SEARCH_FIELDS,
  allTokensMatch,
  personSearchWhere,
  personTokenFields,
  searchTokens,
} from "@/lib/search/name-search"

/**
 * CCF-115 — the shape of the shared person-search filter.
 *
 * The bug was that a flat `OR` of `contains` clauses can never match a full
 * "First Last" query, because no single column holds both words. These tests pin
 * the AND-of-ORs shape that fixes it, plus the tokenizer's edges.
 */

describe("searchTokens", () => {
  it("splits on whitespace", () => {
    expect(searchTokens("Maria Santos")).toEqual(["Maria", "Santos"])
  })

  it("collapses runs of whitespace and trims", () => {
    expect(searchTokens("  Maria   \t Santos \n")).toEqual(["Maria", "Santos"])
  })

  it("returns a single token for a one-word query", () => {
    expect(searchTokens("Maria")).toEqual(["Maria"])
  })

  it("returns nothing for a blank or whitespace-only query", () => {
    expect(searchTokens("")).toEqual([])
    expect(searchTokens("   ")).toEqual([])
  })

  it("caps a pathologically long query", () => {
    const many = Array.from({ length: 40 }, (_, i) => `t${i}`).join(" ")
    expect(searchTokens(many)).toHaveLength(MAX_SEARCH_TOKENS)
  })
})

describe("allTokensMatch", () => {
  const fields = (t: string) => [{ firstName: { contains: t } }, { lastName: { contains: t } }]

  it("requires every token to match some field", () => {
    expect(allTokensMatch("Maria Santos", fields)).toEqual({
      AND: [
        { OR: [{ firstName: { contains: "Maria" } }, { lastName: { contains: "Maria" } }] },
        { OR: [{ firstName: { contains: "Santos" } }, { lastName: { contains: "Santos" } }] },
      ],
    })
  })

  it("keeps single-word search as one OR — the pre-fix behavior", () => {
    expect(allTokensMatch("Maria", fields)).toEqual({
      AND: [
        { OR: [{ firstName: { contains: "Maria" } }, { lastName: { contains: "Maria" } }] },
      ],
    })
  })

  it("returns null for a blank query so callers can skip the filter", () => {
    expect(allTokensMatch("", fields)).toBeNull()
    expect(allTokensMatch("   ", fields)).toBeNull()
  })

  it("is order-independent — the same AND set regardless of token order", () => {
    const forward = allTokensMatch("Maria Santos", fields)!
    const reversed = allTokensMatch("Santos Maria", fields)!
    expect(forward.AND).toEqual(expect.arrayContaining(reversed.AND))
    expect(reversed.AND).toEqual(expect.arrayContaining(forward.AND))
  })
})

describe("personTokenFields", () => {
  it("covers the full person field set by default", () => {
    const conditions = personTokenFields("ma")
    expect(conditions).toHaveLength(PERSON_SEARCH_FIELDS.length)
    expect(conditions).toContainEqual({ firstName: { contains: "ma", mode: "insensitive" } })
    expect(conditions).toContainEqual({ phone: { contains: "ma", mode: "insensitive" } })
    expect(conditions).toContainEqual({ email: { contains: "ma", mode: "insensitive" } })
  })

  it("narrows to name-only fields when asked", () => {
    const conditions = personTokenFields("ma", PERSON_NAME_FIELDS)
    expect(conditions).toHaveLength(3)
    expect(conditions).not.toContainEqual({ phone: { contains: "ma", mode: "insensitive" } })
  })

  it("nests under a relation when a prefix is given", () => {
    expect(personTokenFields("ma", PERSON_NAME_FIELDS, "member")).toContainEqual({
      member: { firstName: { contains: "ma", mode: "insensitive" } },
    })
  })

  it("always searches case-insensitively", () => {
    for (const condition of personTokenFields("ma")) {
      const inner = Object.values(condition)[0] as { mode: string }
      expect(inner.mode).toBe("insensitive")
    }
  })
})

describe("personSearchWhere", () => {
  it("produces one AND entry per token", () => {
    const where = personSearchWhere("Maria Santos")!
    expect(where.AND).toHaveLength(2)
    expect(where.AND[0].OR).toHaveLength(PERSON_SEARCH_FIELDS.length)
  })

  it("returns null for a blank query", () => {
    expect(personSearchWhere("")).toBeNull()
  })

  it("carries the relation prefix through to every condition", () => {
    const where = personSearchWhere("Maria Santos", {
      fields: PERSON_NAME_FIELDS,
      prefix: "member",
    })!
    for (const clause of where.AND) {
      for (const condition of clause.OR) {
        expect(Object.keys(condition)).toEqual(["member"])
      }
    }
  })
})
