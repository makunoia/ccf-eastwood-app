import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { createAuthorizationCode, isAllowedMcpClient } from "@/lib/mcp/auth"
import { sanitizeRequestedScopes } from "@/lib/mcp/scopes"

const CONSENT_COOKIE = "churchie_mcp_consent"
function invalid(message: string) { return NextResponse.json({ error: "invalid_request", error_description: message }, { status: 400 }) }
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!) }

function validated(url: URL) {
  const clientId = url.searchParams.get("client_id"), redirectUri = url.searchParams.get("redirect_uri")
  const responseType = url.searchParams.get("response_type"), scope = sanitizeRequestedScopes(url.searchParams.get("scope"))
  const challenge = url.searchParams.get("code_challenge"), method = url.searchParams.get("code_challenge_method")
  const state = url.searchParams.get("state"), resource = url.searchParams.get("resource")
  if (!clientId || !redirectUri || responseType !== "code" || !scope || !challenge || !/^[A-Za-z0-9_-]{43,128}$/.test(challenge) || method !== "S256" || resource !== `${url.origin}/api/mcp`) return null
  try { const redirect = new URL(redirectUri); if (redirect.protocol !== "https:" && process.env.NODE_ENV === "production") return null } catch { return null }
  if (!isAllowedMcpClient(clientId, redirectUri)) return null
  return { clientId, redirectUri, scope, challenge, state, resource }
}

async function signedIn(request: Request) {
  const session = await auth()
  if (session?.user?.id) return session.user.id
  const login = new URL("/login", request.url); login.searchParams.set("callbackUrl", request.url)
  return NextResponse.redirect(login)
}

export async function GET(request: Request) {
  const url = new URL(request.url), params = validated(url)
  if (!params) return invalid("A valid PKCE authorization-code request for the Churchie MCP resource is required.")
  const user = await signedIn(request); if (user instanceof NextResponse) return user
  const nonce = crypto.randomUUID(), jar = await cookies()
  jar.set(CONSENT_COOKIE, nonce, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/oauth/authorize" })
  const fields = [...url.searchParams.entries(), ["consent_nonce", nonce] as const].map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`).join("")
  const scopes = params.scope.map((scope) => `<li>${escapeHtml(scope.replace(/^churchie:/, "").replaceAll(":", " — "))}</li>`).join("")
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Connect Churchie</title><style>body{font:16px system-ui;background:#f6f7f9;color:#15171a;margin:0}.card{max-width:540px;margin:8vh auto;background:white;padding:32px;border:1px solid #ddd;border-radius:16px}button{padding:11px 18px;border-radius:9px;border:1px solid #bbb;font-weight:650}.allow{background:#15171a;color:white}.actions{display:flex;gap:10px;margin-top:24px}</style></head><body><main class="card"><h1>Connect Churchie Admin</h1><p>ChatGPT is requesting access to your Churchie administrator account. Churchie will continue enforcing your live role, feature permissions, and event access.</p><p>Requested access:</p><ul>${scopes}</ul><p>Mutations still require ChatGPT approval. Deletes and bulk changes remain Super Admin-only.</p><form method="post">${fields}<div class="actions"><button class="allow" name="decision" value="allow">Allow access</button><button name="decision" value="deny">Cancel</button></div></form></main></body></html>`
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" } })
}

export async function POST(request: Request) {
  const url = new URL(request.url), form = await request.formData()
  for (const [key, value] of form.entries()) if (key !== "decision" && key !== "consent_nonce" && typeof value === "string") url.searchParams.append(key, value)
  const params = validated(url); if (!params) return invalid("The authorization request is invalid or expired.")
  const user = await signedIn(request); if (user instanceof NextResponse) return user
  const jar = await cookies(), suppliedNonce = form.get("consent_nonce"), expectedNonce = jar.get(CONSENT_COOKIE)?.value
  jar.delete(CONSENT_COOKIE)
  if (typeof suppliedNonce !== "string" || !expectedNonce || suppliedNonce !== expectedNonce) return invalid("The consent session is invalid or expired.")
  const redirect = new URL(params.redirectUri)
  if (form.get("decision") !== "allow") { redirect.searchParams.set("error", "access_denied"); redirect.searchParams.set("iss", url.origin); if (params.state) redirect.searchParams.set("state", params.state); return NextResponse.redirect(redirect) }
  const code = await createAuthorizationCode({ userId: user, clientId: params.clientId, redirectUri: params.redirectUri, resource: params.resource, scope: params.scope, codeChallenge: params.challenge })
  redirect.searchParams.set("code", code); redirect.searchParams.set("iss", url.origin); if (params.state) redirect.searchParams.set("state", params.state)
  return NextResponse.redirect(redirect)
}
