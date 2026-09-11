import { afterEach, describe, expect, it, vi } from "vitest"
import { validateAuthorizationRequest } from "@/app/oauth/authorize/route"

function requestUrl(extra = "") {
  return new URL(`https://staging.ccfeastwood.app/oauth/authorize?client_id=${encodeURIComponent("https://chatgpt.com/oauth/client.json")}&redirect_uri=${encodeURIComponent("https://chatgpt.com/connector_platform_oauth_redirect")}&response_type=code&code_challenge=${"a".repeat(43)}&code_challenge_method=S256&resource=${encodeURIComponent("https://staging.ccfeastwood.app/api/mcp")}${extra}`)
}

describe("MCP OAuth authorization request", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("does not grant implicit scopes when the OAuth client omits scope", () => {
    const result = validateAuthorizationRequest(requestUrl())
    expect(result).toEqual({ ok: false, error: "scope is required." })
  })

  it("reports the mismatched field without echoing credentials", () => {
    const url = requestUrl("&scope=churchie%3Amembers%3Aread"); url.searchParams.set("resource", "https://wrong.example/api/mcp")
    const result = validateAuthorizationRequest(url)
    expect(result).toEqual({ ok: false, error: "The OAuth resource does not match the Churchie MCP endpoint." })
  })

  it("accepts native-app HTTP loopback redirects at the transport validation layer", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("MCP_OAUTH_CLIENTS", "")
    const url = requestUrl("&scope=churchie%3Amembers%3Aread")
    url.searchParams.set("redirect_uri", "http://127.0.0.1:49152/oauth/callback")
    const result = validateAuthorizationRequest(url)
    expect(result).toEqual({ ok: false, error: "The OAuth client or callback is not approved for Churchie." })
  })
})
