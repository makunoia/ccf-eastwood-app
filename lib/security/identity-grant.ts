import { createHmac, timingSafeEqual } from "crypto"

/**
 * Proof that someone demonstrated ownership of a Member/Guest record, carried
 * from the request where they proved it into the later request that acts on it.
 *
 * The public registration form proves identity at step 0 — `revealProfileForRegistration`
 * checks a birth month and year server-side before it hands back a profile. But
 * that proof lived only in React state. `createRegistrant` then received a bare
 * `confirmedMemberId` and trusted it, which meant `touchedFields` — the flag that
 * lets a submission *overwrite* stored profile data rather than only fill blanks —
 * was available to any crafted POST naming any member id. This is the missing half.
 *
 * Deliberately modeled on `lib/auth-tokens.ts` rather than a new table: stateless
 * HMAC over `payload:expiry` means no migration, no cleanup job, and no read on
 * the hot path. What that costs is single-use — a grant is replayable until it
 * expires by whoever holds it. Over HTTPS the holder is the person who earned it,
 * and the TTL bounds the window; making it single-use would need a persistence
 * layer this repo doesn't have.
 *
 * **Scoped to the record, not the event.** What the grant asserts is "this caller
 * owns record X", which is exactly the thing that authorises writing to record X.
 * Event-scoping would add nothing an attacker couldn't get by revealing again,
 * and it would need a special case for the cluster form, which resolves a person
 * once and then fans out across several events.
 */

const GRANT_TTL_MS = 30 * 60 * 1000

export type GrantSubject = {
  recordId: string
  recordType: "member" | "guest"
}

function getSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error("AUTH_SECRET is not set")
  return secret
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex")
}

/**
 * Mint a grant for a record whose ownership has just been proven.
 *
 * `now` is injectable so tests can reach past the expiry without sleeping.
 */
export function signIdentityGrant(subject: GrantSubject, now: number = Date.now()): string {
  const payload = `${subject.recordType}:${subject.recordId}:${now + GRANT_TTL_MS}`
  return `${payload}:${sign(payload)}`
}

/**
 * Whether this grant proves ownership of *this* record.
 *
 * The subject is passed in rather than returned: the caller already knows which
 * record it is about to write to, and asking "does this token authorise that
 * record?" makes a mismatched grant a failure rather than a silent redirect of
 * the write onto whatever the token happens to name.
 */
export function verifyIdentityGrant(
  token: string | null | undefined,
  subject: GrantSubject,
  now: number = Date.now()
): boolean {
  if (!token) return false
  try {
    const parts = token.split(":")
    if (parts.length !== 4) return false
    const [recordType, recordId, expiry, sig] = parts

    const expected = sign(`${recordType}:${recordId}:${expiry}`)
    const sigBuf = Buffer.from(sig, "hex")
    const expectedBuf = Buffer.from(expected, "hex")
    // Length check first: `timingSafeEqual` throws on a mismatch rather than
    // returning false, and a truncated signature is a forgery like any other.
    if (sigBuf.length !== expectedBuf.length) return false
    if (!timingSafeEqual(sigBuf, expectedBuf)) return false

    if (now > parseInt(expiry, 10)) return false
    return recordType === subject.recordType && recordId === subject.recordId
  } catch {
    // A missing secret must not read as "valid". Every failure here is a refusal.
    return false
  }
}

/**
 * Mint a grant without letting a configuration problem take registration down.
 *
 * The reveal is on the critical path of a public form: if `AUTH_SECRET` is
 * missing, the right outcome is a registration that still works with the
 * pre-existing fill-if-empty rule, not a 500 at the door. Callers treat a null
 * exactly as they treat an absent grant.
 */
export function tryIssueIdentityGrant(subject: GrantSubject): string | null {
  try {
    return signIdentityGrant(subject)
  } catch {
    return null
  }
}
