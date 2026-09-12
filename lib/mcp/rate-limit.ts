type Entry = { count: number; resetAt: number }
const buckets = new Map<string, Entry>()

/** Best-effort per-instance protection; production edge/WAF limits should sit in front of this. */
export function consumeMcpRateLimit(key: string, limit = 120, windowMs = 60_000, now = Date.now()) {
  const current = buckets.get(key)
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: limit - 1, retryAfter: 0 }
  }
  current.count++
  return { allowed: current.count <= limit, remaining: Math.max(0, limit - current.count), retryAfter: Math.ceil((current.resetAt - now) / 1000) }
}

export function resetMcpRateLimitsForTests() { buckets.clear() }
