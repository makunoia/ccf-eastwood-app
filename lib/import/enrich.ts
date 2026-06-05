export function hasText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0
}

export function enrichText(existing: string | null | undefined, incoming: string | null | undefined): string | null {
  if (hasText(existing)) return existing
  if (hasText(incoming)) return incoming
  return null
}

export function enrichNullable<T>(existing: T | null | undefined, incoming: T | null | undefined): T | null {
  return existing ?? incoming ?? null
}

export function enrichArray<T>(existing: T[] | null | undefined, incoming: T[] | null | undefined): T[] {
  if (existing && existing.length > 0) return existing
  if (incoming && incoming.length > 0) return incoming
  return []
}
