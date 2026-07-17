import { NextResponse } from "next/server"
import { createAgentUIStreamResponse } from "ai"
import { auth } from "@/lib/auth"
import { isSuperAdmin } from "@/lib/permissions"
import { buildAssistantAgent } from "@/lib/assistant/agent"

// Multi-step agent loops with tool calls can take a while.
export const maxDuration = 60

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!isSuperAdmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Assistant is not configured — missing ANTHROPIC_API_KEY." },
      { status: 500 }
    )
  }

  let messages: unknown[]
  try {
    const body = (await request.json()) as { messages?: unknown[] }
    if (!Array.isArray(body.messages)) throw new Error("missing messages")
    messages = body.messages
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  return createAgentUIStreamResponse({
    agent: buildAssistantAgent(session),
    uiMessages: messages,
  })
}
