import { ToolLoopAgent, isStepCount, type InferAgentUIMessage } from "ai"
import { anthropic } from "@ai-sdk/anthropic"
import type { Session } from "next-auth"
import { ASSISTANT_MODEL, MAX_OUTPUT_TOKENS, MAX_STEPS } from "./config"
import { buildSystemPrompt } from "./system-prompt"
import { buildAssistantTools, buildToolApproval } from "./tools"

// The agent is constructed per request: its tools close over the caller's
// session so every read/write is permission-checked as that user.
//
// Note on approval security: the AI SDK offers experimental_toolApprovalSecret
// (HMAC-signed approvals) on streamText, but not on ToolLoopAgent. We don't
// need it — the approval card is UX, not the security boundary. A client that
// forged an approval would only reach writes the same authenticated SuperAdmin
// is already allowed to perform directly; canWrite() in each tool plus
// requireWrite() inside every wrapped server action remain the real gates.
export function buildAssistantAgent(session: Session) {
  return new ToolLoopAgent({
    model: anthropic(ASSISTANT_MODEL),
    instructions: buildSystemPrompt(session),
    tools: buildAssistantTools(session),
    toolApproval: buildToolApproval(),
    stopWhen: isStepCount(MAX_STEPS),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  })
}

/** UIMessage type with typed tool parts — import type-only from client code. */
export type AssistantUIMessage = InferAgentUIMessage<
  ReturnType<typeof buildAssistantAgent>
>
