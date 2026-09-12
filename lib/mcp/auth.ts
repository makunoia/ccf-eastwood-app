import "server-only"

import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { db } from "@/lib/db"
import type { FeatureArea, PermissionAction, Prisma } from "@/app/generated/prisma/client"
import { parseScopes, scopeAllows, type McpScope } from "./scopes"

const ACCESS_TTL_MS = 60 * 60 * 1000
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000
const CODE_TTL_MS = 5 * 60 * 1000

export type McpActor = {
  id: string
  username: string
  role: "SuperAdmin" | "Staff"
  scopes: Set<string>
  permissions: Map<FeatureArea, Set<PermissionAction>>
  eventAccess: Set<string>
}

const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const token = () => randomBytes(32).toString("base64url")

/** Production connections are explicitly allow-listed as clientId=redirectUri pairs. */
export function isAllowedMcpClient(clientId: string, redirectUri: string) {
  const configured = process.env.MCP_OAUTH_CLIENTS
  const configuredMatch = configured?.split(",").some((entry) => {
    const separator = entry.indexOf("=")
    return separator > 0 && entry.slice(0, separator).trim() === clientId && entry.slice(separator + 1).trim() === redirectUri
  }) ?? false
  if (configuredMatch) return true
  if (clientId === "https://chatgpt.com/oauth/client.json" && redirectUri === "https://chatgpt.com/connector_platform_oauth_redirect") return true
  if (clientId === "https://chatgpt.com/oauth/codex/client.json") {
    try {
      const redirect = new URL(redirectUri)
      const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(redirect.hostname)
      if (redirect.protocol === "http:" && isLoopback && Boolean(redirect.port) && redirect.pathname === "/callback" && !redirect.username && !redirect.password) return true
    } catch {
      return false
    }
  }
  const client = clientId.match(/^https:\/\/chatgpt\.com\/oauth\/([A-Za-z0-9_-]+)\/client\.json$/)
  const redirect = redirectUri.match(/^https:\/\/chatgpt\.com\/connector\/oauth\/([A-Za-z0-9_-]+)$/)
  if (client && redirect && client[1] === redirect[1]) return true
  return !configured && process.env.NODE_ENV !== "production"
}

function timingSafeStringEqual(left: string, right: string) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function actorCan(actor: McpActor, feature: FeatureArea, action: PermissionAction | "Read") {
  if (!scopeAllows(actor.scopes, feature, action)) return false
  if (actor.role === "SuperAdmin") return true
  const actions = actor.permissions.get(feature)
  return action === "Read" ? Boolean(actions?.size) : Boolean(actions?.has(action as PermissionAction))
}

export function actorCanAccessEvent(actor: McpActor, eventId: string) {
  return actorCan(actor, "Events", "Read") && (actor.role === "SuperAdmin" || actor.eventAccess.size === 0 || actor.eventAccess.has(eventId))
}

/** Event mutations must be checked independently from feature access. */
export function actorCanWriteEvent(actor: McpActor, eventId: string) {
  return actorCan(actor, "Events", "Write") && (actor.role === "SuperAdmin" || actor.eventAccess.size === 0 || actor.eventAccess.has(eventId))
}

export async function actorForUser(userId: string, scope: string): Promise<McpActor | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, role: true, permissions: { select: { feature: true, action: true } }, eventAccess: { select: { eventId: true } } },
  })
  if (!user) return null
  const permissions = new Map<FeatureArea, Set<PermissionAction>>()
  for (const permission of user.permissions) {
    const actions = permissions.get(permission.feature) ?? new Set<PermissionAction>()
    actions.add(permission.action)
    permissions.set(permission.feature, actions)
  }
  return { id: user.id, username: user.username, role: user.role, scopes: parseScopes(scope), permissions, eventAccess: new Set(user.eventAccess.map((item) => item.eventId)) }
}

export async function verifyMcpAccessToken(rawToken: string): Promise<McpActor | null> {
  const accessTokenHash = hash(rawToken)
  const record = await db.mcpToken.findUnique({ where: { accessTokenHash } })
  if (!record || record.revokedAt || record.accessExpiresAt <= new Date()) return null
  await db.mcpToken.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
  return actorForUser(record.userId, record.scope)
}

export async function createAuthorizationCode(input: { userId: string; clientId: string; redirectUri: string; resource: string; scope: McpScope[]; codeChallenge: string }) {
  const rawCode = token()
  await db.mcpAuthorizationCode.create({ data: {
    userId: input.userId, clientId: input.clientId, redirectUri: input.redirectUri, resource: input.resource,
    scope: input.scope.join(" "), codeChallenge: input.codeChallenge, codeHash: hash(rawCode),
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  } })
  return rawCode
}

export async function exchangeAuthorizationCode(input: { code: string; clientId: string; redirectUri: string; resource: string; codeVerifier: string }) {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(input.codeVerifier)) {
    console.warn(JSON.stringify({ level: "warning", operation: "mcp_authorization_code_exchange", rejection: "invalid_pkce_verifier" }))
    return null
  }
  return db.$transaction(async (tx) => {
    const record = await tx.mcpAuthorizationCode.findUnique({ where: { codeHash: hash(input.code) } })
    if (!record) {
      console.warn(JSON.stringify({ level: "warning", operation: "mcp_authorization_code_exchange", rejection: "authorization_code_not_found" }))
      return null
    }
    const rejection = record.status !== "Pending" ? "authorization_code_not_pending"
      : record.expiresAt <= new Date() ? "authorization_code_expired"
      : record.clientId !== input.clientId ? "client_id_mismatch"
      : record.redirectUri !== input.redirectUri ? "redirect_uri_mismatch"
      : record.resource !== input.resource ? "resource_mismatch"
      : null
    if (rejection) {
      console.warn(JSON.stringify({ level: "warning", operation: "mcp_authorization_code_exchange", rejection }))
      return null
    }
    const challenge = createHash("sha256").update(input.codeVerifier).digest("base64url")
    if (!timingSafeStringEqual(challenge, record.codeChallenge)) {
      console.warn(JSON.stringify({ level: "warning", operation: "mcp_authorization_code_exchange", rejection: "pkce_challenge_mismatch" }))
      return null
    }
    // Compare-and-set makes a PKCE code single-use even under concurrent requests.
    const consumed = await tx.mcpAuthorizationCode.updateMany({ where: { id: record.id, status: "Pending", expiresAt: { gt: new Date() } }, data: { status: "Consumed", consumedAt: new Date() } })
    if (consumed.count !== 1) {
      console.warn(JSON.stringify({ level: "warning", operation: "mcp_authorization_code_exchange", rejection: "authorization_code_race" }))
      return null
    }
    return createMcpToken(tx, record.userId, record.clientId, record.resource, record.scope)
  })
}

async function createMcpToken(client: Prisma.TransactionClient | typeof db, userId: string, clientId: string, resource: string, scope: string) {
  const accessToken = token()
  const refreshToken = token()
  const now = Date.now()
  await client.mcpToken.create({ data: {
    userId, clientId, resource, scope, accessTokenHash: hash(accessToken), refreshTokenHash: hash(refreshToken),
    accessExpiresAt: new Date(now + ACCESS_TTL_MS), refreshExpiresAt: new Date(now + REFRESH_TTL_MS),
  } })
  return { access_token: accessToken, refresh_token: refreshToken, token_type: "Bearer", expires_in: ACCESS_TTL_MS / 1000, scope }
}

export async function refreshMcpToken(rawRefreshToken: string, clientId: string, resource: string) {
  return db.$transaction(async (tx) => {
    const refreshTokenHash = hash(rawRefreshToken)
    const record = await tx.mcpToken.findUnique({ where: { refreshTokenHash } })
    if (!record || record.clientId !== clientId || record.resource !== resource || record.revokedAt || record.refreshExpiresAt <= new Date()) return null
    const revoked = await tx.mcpToken.updateMany({ where: { id: record.id, revokedAt: null, refreshExpiresAt: { gt: new Date() } }, data: { revokedAt: new Date() } })
    if (revoked.count !== 1) return null
    return createMcpToken(tx, record.userId, clientId, record.resource, record.scope)
  })
}

export async function revokeMcpToken(rawToken: string) {
  await db.mcpToken.updateMany({ where: { OR: [{ accessTokenHash: hash(rawToken) }, { refreshTokenHash: hash(rawToken) }] }, data: { revokedAt: new Date() } })
}
