# Churchie Admin MCP Plugin

Set `CHURCHIE_MCP_URL` to the deployed Churchie origin, then install this controlled plugin in ChatGPT developer mode. The MCP endpoint is `${CHURCHIE_MCP_URL}/api/mcp` and uses Churchie's OAuth authorization server at the same origin.

In production, set `MCP_OAUTH_CLIENTS` to comma-separated `clientId=redirectUri` pairs issued to approved ChatGPT installations. No unlisted client can complete the authorization flow.

The connector is intentionally restricted to Churchie accounts and enforces the account's live role, feature, OAuth scope, and event access on each call.

## Capabilities

- Search and inspect Members, Guests, DGroups, Ministries, Events, Volunteers, and Families using compact typed records.
- Filter members and guests by profile fields, DGroups by schedule/type/life stage, events by date/type/ministry, and event rosters by payment or attendance.
- Answer operational questions with overview counts, full profiles, DGroup hierarchy and request queues, event session lists, and attendance statistics.
- Run Churchie's DGroup matching engine for a verified member or guest and move an unassigned registration intent into the selected DGroup review flow.
- Create and update records in all supported domains; manage rosters, guest promotion, family roles, registrants, sessions, volunteer committees, and roles.
- Check people in or undo attendance, open or close session check-in, update registrant payment state, and approve or deny DGroup requests.
- Perform Super Admin-only deletes and bulk operations, capped at 100 independently validated records.
- Stage DGroup workbook imports with review, source-row results, conflict-aware apply, and seven-day undo.

All mutations are advertised as approval-required. Deletes remain destructive and Super Admin-only. The server does not expose raw database queries or generic mutation tools.
