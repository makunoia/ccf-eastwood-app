import { createHmac, timingSafeEqual } from "crypto"

const TOKEN_EXPIRY_MS = 5 * 60 * 1000 // 5 minutes

function getSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error("AUTH_SECRET is not set")
  return secret
}

/** Create a signed pre-auth token encoding the userId and expiry timestamp. */
export function signPreAuthToken(userId: string): string {
  const expiry = Date.now() + TOKEN_EXPIRY_MS
  const payload = `${userId}:${expiry}`
  const sig = createHmac("sha256", getSecret()).update(payload).digest("hex")
  return `${payload}:${sig}`
}

/**
 * Verify a pre-auth token.
 * Returns the userId if valid, or null if tampered/expired.
 */
export function verifyPreAuthToken(token: string): string | null {
  try {
    const parts = token.split(":")
    if (parts.length !== 3) return null
    const [userId, expiry, sig] = parts
    const payload = `${userId}:${expiry}`
    const expected = createHmac("sha256", getSecret()).update(payload).digest("hex")
    const sigBuf = Buffer.from(sig, "hex")
    const expectedBuf = Buffer.from(expected, "hex")
    if (sigBuf.length !== expectedBuf.length) return null
    if (!timingSafeEqual(sigBuf, expectedBuf)) return null
    if (Date.now() > parseInt(expiry, 10)) return null
    return userId
  } catch {
    return null
  }
}
