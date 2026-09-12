import { NextResponse } from "next/server"
import { exchangeAuthorizationCode, refreshMcpToken } from "@/lib/mcp/auth"

export async function POST(request: Request) {
  const form = await request.formData()
  const grantType = String(form.get("grant_type") ?? "")
  const clientId = String(form.get("client_id") ?? "")
  const resource = String(form.get("resource") ?? "")
  const expectedResource = `${new URL(request.url).origin}/api/mcp`
  if (!clientId || resource !== expectedResource) {
    console.warn(JSON.stringify({ level: "warning", route: "/oauth/token", rejection: !clientId ? "missing_client_id" : "resource_mismatch", grantType, hasResource: Boolean(resource) }))
    return NextResponse.json({ error: "invalid_request", error_description: "client_id and the Churchie MCP resource are required" }, { status: 400 })
  }
  const result = grantType === "authorization_code"
    ? await exchangeAuthorizationCode({ code: String(form.get("code") ?? ""), clientId, resource, redirectUri: String(form.get("redirect_uri") ?? ""), codeVerifier: String(form.get("code_verifier") ?? "") })
    : grantType === "refresh_token"
      ? await refreshMcpToken(String(form.get("refresh_token") ?? ""), clientId, resource)
      : null
  if (!result) {
    console.warn(JSON.stringify({ level: "warning", route: "/oauth/token", rejection: "invalid_grant", grantType, hasRedirectUri: Boolean(form.get("redirect_uri")), hasCodeVerifier: Boolean(form.get("code_verifier")) }))
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 })
  }
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } })
}
