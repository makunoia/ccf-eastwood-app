import { authenticator } from "@otplib/preset-default"

// Configure once at module level — allows ±1 time-step window to account for clock drift
authenticator.options = { window: 1 }

/** Generate a new base32-encoded TOTP secret. */
export function generateSecret(): string {
  return authenticator.generateSecret()
}

/**
 * Build an otpauth:// URI for QR code display.
 * @param secret        base32 TOTP secret
 * @param accountLabel  account identifier shown in the authenticator app (e.g. username)
 * @param issuer        app/org name shown in the authenticator app
 */
export function buildTotpUri(secret: string, accountLabel: string, issuer = "CCF Eastwood Admin App"): string {
  return authenticator.keyuri(accountLabel, issuer, secret)
}

/**
 * Verify a 6-digit TOTP code against a secret.
 * Allows ±1 time step window to account for clock drift.
 */
export function verifyTotpCode(secret: string, code: string): boolean {
  return authenticator.verify({ token: code, secret })
}
