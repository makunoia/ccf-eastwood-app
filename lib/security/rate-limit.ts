/**
 * Fixed-window rate limiting for public, unauthenticated endpoints.
 *
 * Built for the step-0 profile lookup on the registration form (CCF-147): that
 * endpoint answers "does a profile exist for this number?", so without a limit
 * it is an oracle anyone can walk the Philippine mobile number space against.
 *
 * **Known limitation — this counts per instance, not globally.** The repo has no
 * Redis/KV and no shared store, so the window lives in this process's memory and
 * Vercel runs several function instances. The effective limit is therefore
 * `limit × instances`. That is enough to stop casual enumeration from a browser
 * or a single script; it is not a defence against a distributed attacker.
 * Upgrading to a shared counter means replacing this one module and nothing else.
 *
 * `now` is injectable so the whole thing is unit-testable without fake timers.
 */

type Window = { count: number; resetAt: number }

const windows = new Map<string, Window>()

/**
 * Entries are only ever evicted lazily, on a later call for the same key, so a
 * long-lived instance seeing many distinct IPs would grow the map without bound.
 * Sweeping expired windows once the map gets large keeps it proportional to
 * *active* callers rather than to every caller ever seen.
 */
const SWEEP_THRESHOLD = 10_000

function sweep(now: number): void {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key)
  }
}

export type RateLimitResult = {
  allowed: boolean
  /** Milliseconds until the current window rolls over. 0 when allowed. */
  retryAfterMs: number
}

export function checkRateLimit(
  key: string,
  opts: { limit: number; windowMs: number; now?: number }
): RateLimitResult {
  const now = opts.now ?? Date.now()
  const existing = windows.get(key)

  if (!existing || existing.resetAt <= now) {
    if (windows.size >= SWEEP_THRESHOLD) sweep(now)
    windows.set(key, { count: 1, resetAt: now + opts.windowMs })
    return { allowed: true, retryAfterMs: 0 }
  }

  if (existing.count >= opts.limit) {
    return { allowed: false, retryAfterMs: existing.resetAt - now }
  }

  existing.count += 1
  return { allowed: true, retryAfterMs: 0 }
}

/** Test seam — no production caller. */
export function resetRateLimits(): void {
  windows.clear()
}

/**
 * The caller's IP, as far as the platform will tell us.
 *
 * `x-forwarded-for` is a comma-separated chain appended to by each proxy; the
 * left-most entry is the original client. Behind Vercel that header is set by
 * the platform, so it can't be spoofed by the client — but a self-hosted
 * deployment behind no proxy could, which is one more reason this limiter is a
 * speed bump rather than a security boundary.
 *
 * Falls back to a single shared bucket rather than to "unlimited": an unknown
 * origin should still be counted, even if every unknown origin shares one
 * budget.
 */
export const UNKNOWN_IP_BUCKET = "unknown"

export function clientIpFrom(headers: {
  get(name: string): string | null
}): string {
  const forwarded = headers.get("x-forwarded-for")
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim()
    if (first) return first
  }
  const real = headers.get("x-real-ip")?.trim()
  if (real) return real
  return UNKNOWN_IP_BUCKET
}
