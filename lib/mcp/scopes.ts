import type { FeatureArea, PermissionAction } from "@/app/generated/prisma/client"

export const MCP_SCOPES = [
  // OAuth standard scope: ChatGPT uses this to retain a renewable connection.
  "offline_access",
  "churchie:members:read", "churchie:members:write",
  "churchie:guests:read", "churchie:guests:write",
  "churchie:small-groups:read", "churchie:small-groups:write", "churchie:small-groups:import",
  "churchie:ministries:read", "churchie:ministries:write",
  "churchie:events:read", "churchie:events:write",
  "churchie:volunteers:read", "churchie:volunteers:write",
] as const

export type McpScope = (typeof MCP_SCOPES)[number]

const FEATURE_SCOPE: Record<FeatureArea, string> = {
  Members: "members", Guests: "guests", SmallGroups: "small-groups",
  Ministries: "ministries", Events: "events", Volunteers: "volunteers", Forms: "forms",
}

export function parseScopes(value: string | null | undefined): Set<string> {
  return new Set((value ?? "").split(/\s+/).filter(Boolean))
}

export function scopesForPermission(feature: FeatureArea, action: PermissionAction | "Read"): string[] {
  const resource = FEATURE_SCOPE[feature]
  if (action === "Read") return [`churchie:${resource}:read`]
  return [`churchie:${resource}:${action.toLowerCase()}`]
}

export function scopeAllows(scopes: Set<string>, feature: FeatureArea, action: PermissionAction | "Read"): boolean {
  return scopesForPermission(feature, action).every((scope) => scopes.has(scope))
}

export function sanitizeRequestedScopes(value: string | null): McpScope[] | null {
  const scopes = [...parseScopes(value)]
  if (scopes.length === 0 || scopes.some((scope) => !MCP_SCOPES.includes(scope as McpScope))) return null
  return scopes as McpScope[]
}
