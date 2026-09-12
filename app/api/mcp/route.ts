import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { NextResponse } from "next/server"
import { createChurchieMcpServer } from "@/lib/mcp/server"
import { verifyMcpAccessToken } from "@/lib/mcp/auth"
import { createHash } from "node:crypto"
import { consumeMcpRateLimit } from "@/lib/mcp/rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function actorFromRequest(request: Request) {
  const authorization = request.headers.get("authorization")
  if (!authorization?.startsWith("Bearer ")) return null
  return verifyMcpAccessToken(authorization.slice("Bearer ".length))
}

async function handle(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0")
  if (Number.isFinite(contentLength) && contentLength > 1024 * 1024) return NextResponse.json({ error: "Request body too large" }, { status: 413 })
  const credential = request.headers.get("authorization") ?? request.headers.get("x-forwarded-for") ?? "anonymous"
  const rate = consumeMcpRateLimit(createHash("sha256").update(credential).digest("hex"))
  if (!rate.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } })
  const actor = await actorFromRequest(request)
  if (!actor) {
    const metadataUrl = new URL("/.well-known/oauth-protected-resource", request.url).toString()
    return NextResponse.json({ error: "Unauthorized", error_description: "Connect Churchie from ChatGPT to continue." }, { status: 401, headers: { "WWW-Authenticate": `Bearer resource_metadata="${metadataUrl}"` } })
  }
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true })
  const server = createChurchieMcpServer(actor)
  await server.connect(transport)
  return transport.handleRequest(request)
}

export const GET = handle
export const POST = handle
export const DELETE = handle
