import { NextResponse } from "next/server"
import { MCP_SCOPES } from "@/lib/mcp/scopes"

export function GET(request: Request) {
  const origin = new URL(request.url).origin
  return NextResponse.json({ resource: `${origin}/api/mcp`, authorization_servers: [origin], scopes_supported: MCP_SCOPES })
}
