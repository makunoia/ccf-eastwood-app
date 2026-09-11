import { NextResponse } from "next/server"
import { MCP_SCOPES } from "@/lib/mcp/scopes"

export function GET(request: Request) {
  const origin = new URL(request.url).origin
  return NextResponse.json({ issuer: origin, authorization_response_iss_parameter_supported: true, client_id_metadata_document_supported: true, authorization_endpoint: `${origin}/oauth/authorize`, token_endpoint: `${origin}/oauth/token`, revocation_endpoint: `${origin}/oauth/revoke`, response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"], code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none"], scopes_supported: MCP_SCOPES })
}
