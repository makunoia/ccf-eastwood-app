# Churchie Admin MCP Plugin

Set `CHURCHIE_MCP_URL` to the deployed Churchie origin, then install this controlled plugin in ChatGPT developer mode. The MCP endpoint is `${CHURCHIE_MCP_URL}/api/mcp` and uses Churchie's OAuth authorization server at the same origin.

In production, set `MCP_OAUTH_CLIENTS` to comma-separated `clientId=redirectUri` pairs issued to approved ChatGPT installations. No unlisted client can complete the authorization flow.

The first release is intentionally restricted to Churchie accounts and enforces the account's live role, feature, and event access on each call.
