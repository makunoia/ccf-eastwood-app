import { afterEach, describe, expect, it, vi } from "vitest"
import { authorizationPageCsp, validateAuthorizationRequest } from "@/app/oauth/authorize/route"
import { CODEX_OAUTH_CLIENT_ID, isAllowedMcpClient, redirectUrisMatch } from "@/lib/mcp/auth"

function requestUrl(extra = "") {
  return new URL(`https://staging.ccfeastwood.app/oauth/authorize?client_id=${encodeURIComponent("https://chatgpt.com/oauth/client.json")}&redirect_uri=${encodeURIComponent("https://chatgpt.com/connector_platform_oauth_redirect")}&response_type=code&code_challenge=${"a".repeat(43)}&code_challenge_method=S256&resource=${encodeURIComponent("https://staging.ccfeastwood.app/api/mcp")}${extra}`)
}

describe("MCP OAuth authorization request", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("does not grant implicit scopes when the OAuth client omits scope", () => {
    const result = validateAuthorizationRequest(requestUrl())
    expect(result).toEqual({ ok: false, error: "scope is required." })
  })

  it("requires offline_access before issuing a renewable MCP connection", () => {
    const result = validateAuthorizationRequest(requestUrl("&scope=churchie%3Amembers%3Aread"))
    expect(result).toEqual({ ok: false, error: "offline_access is required for a renewable Churchie MCP connection." })
  })

  it("reports the mismatched field without echoing credentials", () => {
    const url = requestUrl("&scope=offline_access%20churchie%3Amembers%3Aread"); url.searchParams.set("resource", "https://wrong.example/api/mcp")
    const result = validateAuthorizationRequest(url)
    expect(result).toEqual({ ok: false, error: "The OAuth resource does not match the Churchie MCP endpoint." })
  })

  it.each([
    "http://127.0.0.1:49152/callback",
    "http://localhost:53147/callback",
    "http://[::1]:61901/callback",
  ])("accepts the Codex native callback with a dynamic loopback port: %s", (redirectUri) => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("MCP_OAUTH_CLIENTS", "")
    const url = requestUrl("&scope=offline_access%20churchie%3Amembers%3Aread")
    url.searchParams.set("client_id", CODEX_OAUTH_CLIENT_ID)
    url.searchParams.set("redirect_uri", redirectUri)
    const result = validateAuthorizationRequest(url)
    expect(result.ok, JSON.stringify(result)).toBe(true)
  })

  it("requires an exact configured callback pair for normal web clients", () => {
    vi.stubEnv("NODE_ENV", "production")
    const clientId = "https://chatgpt.com/oauth/client.json"
    const redirectUri = "https://chatgpt.com/connector_platform_oauth_redirect"
    vi.stubEnv("MCP_OAUTH_CLIENTS", `${clientId}=${redirectUri}`)
    expect(isAllowedMcpClient(clientId, redirectUri)).toBe(true)
    expect(isAllowedMcpClient(clientId, "https://chatgpt.com/another_callback")).toBe(false)
  })

  it.each([
    ["HTTPS loopback", "https://127.0.0.1:49152/callback"],
    ["a non-loopback host", "http://attacker.example:49152/callback"],
    ["a missing port", "http://127.0.0.1/callback"],
    ["a non-callback path", "http://127.0.0.1:49152/other"],
    ["a query string", "http://127.0.0.1:49152/callback?next=1"],
    ["a fragment", "http://127.0.0.1:49152/callback#fragment"],
    ["user info", "http://user@127.0.0.1:49152/callback"],
    ["port zero", "http://127.0.0.1:0/callback"],
  ])("rejects a Codex native callback with %s", (_reason, redirectUri) => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("MCP_OAUTH_CLIENTS", "")
    expect(isAllowedMcpClient(CODEX_OAUTH_CLIENT_ID, redirectUri)).toBe(false)
  })

  it("does not let a configured pair bypass the Codex native redirect policy", () => {
    vi.stubEnv("NODE_ENV", "production")
    const redirectUri = "https://127.0.0.1:49152/callback"
    vi.stubEnv("MCP_OAUTH_CLIENTS", `${CODEX_OAUTH_CLIENT_ID}=${redirectUri}`)
    expect(isAllowedMcpClient(CODEX_OAUTH_CLIENT_ID, redirectUri)).toBe(false)
  })

  it("rejects unknown clients even if they use a valid-looking loopback callback", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("MCP_OAUTH_CLIENTS", "")
    expect(isAllowedMcpClient("https://chatgpt.com/oauth/another-client/client.json", "http://127.0.0.1:49152/callback")).toBe(false)
  })

  it("allows the validated callback origin in the consent page form policy", () => {
    expect(authorizationPageCsp("http://localhost:54756/callback")).toContain("form-action 'self' http://localhost:54756;")
    expect(authorizationPageCsp("http://localhost:54756/callback")).not.toContain("http://localhost:*")
  })

  it("treats Codex loopback host aliases as equivalent only on the same port and path", () => {
    expect(redirectUrisMatch(CODEX_OAUTH_CLIENT_ID, "http://localhost:54756/callback", "http://127.0.0.1:54756/callback")).toBe(true)
    expect(redirectUrisMatch(CODEX_OAUTH_CLIENT_ID, "http://localhost:54756/callback", "http://[::1]:54756/callback")).toBe(true)
    expect(redirectUrisMatch(CODEX_OAUTH_CLIENT_ID, "http://localhost:54756/callback", "http://127.0.0.1:54757/callback")).toBe(false)
    expect(redirectUrisMatch(CODEX_OAUTH_CLIENT_ID, "http://localhost:54756/callback", "https://127.0.0.1:54756/callback")).toBe(false)
    expect(redirectUrisMatch(CODEX_OAUTH_CLIENT_ID, "http://localhost:54756/callback", "http://127.0.0.1:54756/callback?next=1")).toBe(false)
    expect(redirectUrisMatch("another-client", "http://localhost:54756/callback", "http://127.0.0.1:54756/callback")).toBe(false)
  })

  it.each([
    "https://127.0.0.1:54756/callback",
    "http://attacker.example:54756/callback",
    "http://127.0.0.1/callback",
    "http://127.0.0.1:54756/other",
    "http://127.0.0.1:54756/callback?next=1",
    "http://127.0.0.1:54756/callback#fragment",
    "http://user@127.0.0.1:54756/callback",
  ])("rejects the same invalid Codex callback during code exchange: %s", (tokenRedirectUri) => {
    expect(redirectUrisMatch(CODEX_OAUTH_CLIENT_ID, "http://localhost:54756/callback", tokenRedirectUri)).toBe(false)
  })
})
