import { randomBytes } from "crypto"

const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*"

/**
 * Generate a cryptographically random 16-character password.
 * Uses a charset that avoids visually ambiguous characters (0, O, I, l, 1).
 */
export function generatePassword(length = 16): string {
  const bytes = randomBytes(length)
  return Array.from(bytes)
    .map((b) => CHARSET[b % CHARSET.length])
    .join("")
}
