/**
 * The grant that carries "this caller owns record X" from the step-0 reveal into
 * the submit that writes to X.
 *
 * `now` is injected rather than faking timers, so the expiry arithmetic is
 * asserted directly — same idiom as `rate-limit.test.ts`.
 */
import { describe, it, expect, afterEach } from "vitest"
import {
  signIdentityGrant,
  verifyIdentityGrant,
  tryIssueIdentityGrant,
  type GrantSubject,
} from "@/lib/security/identity-grant"

const MEMBER: GrantSubject = { recordId: "member-1", recordType: "member" }
const GUEST: GrantSubject = { recordId: "guest-1", recordType: "guest" }

const ORIGINAL_SECRET = process.env.AUTH_SECRET

afterEach(() => {
  process.env.AUTH_SECRET = ORIGINAL_SECRET
})

describe("signIdentityGrant / verifyIdentityGrant", () => {
  it("accepts a grant for the record it was minted for", () => {
    expect(verifyIdentityGrant(signIdentityGrant(MEMBER), MEMBER)).toBe(true)
    expect(verifyIdentityGrant(signIdentityGrant(GUEST), GUEST)).toBe(true)
  })

  it("refuses a grant minted for a different record", () => {
    // The whole point: a caller who proved they own one profile cannot turn that
    // into permission to overwrite somebody else's.
    const grant = signIdentityGrant(MEMBER)
    expect(verifyIdentityGrant(grant, { recordId: "member-2", recordType: "member" })).toBe(false)
  })

  it("refuses a member grant presented for the guest of the same id", () => {
    // Member and Guest ids come from separate sequences and can collide, so the
    // type is part of the identity rather than decoration.
    const grant = signIdentityGrant({ recordId: "shared-id", recordType: "member" })
    expect(verifyIdentityGrant(grant, { recordId: "shared-id", recordType: "guest" })).toBe(false)
  })

  it("refuses a grant past its expiry", () => {
    const issued = 1_000_000
    const grant = signIdentityGrant(MEMBER, issued)
    // Still good half an hour later, gone a second after.
    expect(verifyIdentityGrant(grant, MEMBER, issued + 30 * 60 * 1000)).toBe(true)
    expect(verifyIdentityGrant(grant, MEMBER, issued + 30 * 60 * 1000 + 1)).toBe(false)
  })

  it("refuses a grant whose expiry was edited", () => {
    const grant = signIdentityGrant(MEMBER, 1_000_000)
    const [recordType, recordId, , sig] = grant.split(":")
    const extended = [recordType, recordId, String(9_999_999_999_999), sig].join(":")
    expect(verifyIdentityGrant(extended, MEMBER)).toBe(false)
  })

  it("refuses a grant whose record was swapped", () => {
    const grant = signIdentityGrant(MEMBER, 1_000_000)
    const [recordType, , expiry, sig] = grant.split(":")
    const swapped = [recordType, "member-2", expiry, sig].join(":")
    expect(verifyIdentityGrant(swapped, { recordId: "member-2", recordType: "member" })).toBe(false)
  })

  it("refuses a tampered, truncated or malformed signature", () => {
    const grant = signIdentityGrant(MEMBER)
    const [recordType, recordId, expiry, sig] = grant.split(":")

    const flipped = sig.startsWith("a") ? `b${sig.slice(1)}` : `a${sig.slice(1)}`
    expect(verifyIdentityGrant([recordType, recordId, expiry, flipped].join(":"), MEMBER)).toBe(false)
    // Truncation must not slip past `timingSafeEqual`, which throws on a length
    // mismatch rather than returning false.
    expect(verifyIdentityGrant([recordType, recordId, expiry, sig.slice(0, 8)].join(":"), MEMBER)).toBe(false)
    expect(verifyIdentityGrant([recordType, recordId, expiry, "not-hex"].join(":"), MEMBER)).toBe(false)
  })

  it("refuses anything that isn't a grant", () => {
    for (const junk of ["", "a:b:c", "a:b:c:d:e", "member-1"]) {
      expect(verifyIdentityGrant(junk, MEMBER)).toBe(false)
    }
    expect(verifyIdentityGrant(null, MEMBER)).toBe(false)
    expect(verifyIdentityGrant(undefined, MEMBER)).toBe(false)
  })

  it("refuses every grant once the secret changes", () => {
    const grant = signIdentityGrant(MEMBER)
    process.env.AUTH_SECRET = "a-different-secret"
    expect(verifyIdentityGrant(grant, MEMBER)).toBe(false)
  })

  it("refuses rather than throws when the secret is missing", () => {
    // A misconfigured deployment must fail closed. Throwing here would surface as
    // the catch-all "please try again" and read as a transient error.
    delete process.env.AUTH_SECRET
    expect(verifyIdentityGrant("member:member-1:9999999999999:abcd", MEMBER)).toBe(false)
  })
})

describe("tryIssueIdentityGrant", () => {
  it("mints a usable grant in the ordinary case", () => {
    const grant = tryIssueIdentityGrant(MEMBER)
    expect(grant).not.toBeNull()
    expect(verifyIdentityGrant(grant, MEMBER)).toBe(true)
  })

  it("returns null instead of taking registration down with it", () => {
    // The reveal is on the critical path of a public form. Without a secret the
    // right outcome is a registration that still works under fill-if-empty, not a
    // 500 at the door.
    delete process.env.AUTH_SECRET
    expect(tryIssueIdentityGrant(MEMBER)).toBeNull()
  })
})
