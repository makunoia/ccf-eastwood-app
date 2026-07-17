import { describe, expect, it, beforeEach, vi } from "vitest"
import { auth } from "@/lib/auth"
import { POST } from "@/app/api/assistant/route"

type MockedSession = Awaited<ReturnType<typeof auth>>

const staffSession = {
  user: {
    id: "u2",
    username: "staff-user",
    role: "Staff",
    permissions: [{ feature: "Members", actions: ["Read", "Write"] }],
    eventAccess: [],
    totpEnabled: false,
    mustChangePassword: false,
    requiresTotpSetup: false,
  },
} as unknown as MockedSession

function makeRequest(body: unknown = { messages: [] }) {
  return new Request("http://localhost/api/assistant", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.mocked(auth).mockReset()
})

describe("POST /api/assistant gates", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as unknown as MockedSession)
    const res = await POST(makeRequest())
    expect(res.status).toBe(401)
  })

  it("returns 403 for Staff users (SuperAdmin-only in v1)", async () => {
    vi.mocked(auth).mockResolvedValue(staffSession)
    const res = await POST(makeRequest())
    expect(res.status).toBe(403)
  })
})
