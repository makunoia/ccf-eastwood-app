"use client"

import * as React from "react"
import { IconLoader2 } from "@tabler/icons-react"
import { getToolName, isToolUIPart, type UIMessage } from "ai"
import { cn } from "@/lib/utils"
import { AssistantMarkdown } from "./assistant-markdown"
import { ApprovalCard } from "./approval-card"
import { renderToolOutput, TOOL_LOADING_LABELS } from "./tool-renderers"

function ToolPart({
  part,
  onApprovalResponse,
}: {
  part: Extract<UIMessage["parts"][number], { state: string }> & {
    type: `tool-${string}`
  }
  onApprovalResponse: (approvalId: string, approved: boolean) => void
}) {
  const toolName = getToolName(part as Parameters<typeof getToolName>[0])

  switch (part.state) {
    case "input-streaming":
    case "input-available":
      return (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <IconLoader2 className="size-3 animate-spin" />
          {TOOL_LOADING_LABELS[toolName] ?? "Working…"}
        </p>
      )
    case "approval-requested":
      if (part.approval?.isAutomatic) return null
      return (
        <ApprovalCard
          toolName={toolName}
          input={part.input}
          responded={false}
          onRespond={(approved) => onApprovalResponse(part.approval!.id, approved)}
        />
      )
    case "approval-responded":
      return (
        <ApprovalCard
          toolName={toolName}
          input={part.input}
          responded
          approved={part.approval?.approved === true}
          onRespond={() => {}}
        />
      )
    case "output-available":
      return <>{renderToolOutput(toolName, part.output)}</>
    case "output-denied":
      return (
        <ApprovalCard
          toolName={toolName}
          input={part.input}
          responded
          approved={false}
          onRespond={() => {}}
        />
      )
    case "output-error":
      return (
        <p className="text-xs text-destructive">
          Something went wrong running this step.
        </p>
      )
    default:
      return null
  }
}

export function MessageList({
  messages,
  isStreaming,
  onApprovalResponse,
}: {
  messages: UIMessage[]
  isStreaming: boolean
  onApprovalResponse: (approvalId: string, approved: boolean) => void
}) {
  const bottomRef = React.useRef<HTMLDivElement>(null)
  const partCount = messages.reduce((n, m) => n + m.parts.length, 0)

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" })
  }, [partCount, isStreaming])

  return (
    <div className="flex flex-col gap-3 p-4">
      {messages.length === 0 && (
        <div className="py-10 text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground">How can I help?</p>
          <p className="mt-1.5">
            Ask about members, guests, small groups, events, or volunteers — or ask me to
            update records for you.
          </p>
        </div>
      )}
      {messages.map((message) =>
        message.role === "user" ? (
          <div key={message.id} className="flex justify-end">
            <div className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground whitespace-pre-wrap">
              {message.parts
                .map((p) => (p.type === "text" ? p.text : ""))
                .join("")}
            </div>
          </div>
        ) : (
          <div key={message.id} className="flex flex-col gap-2">
            {message.parts.map((part, i) => {
              if (part.type === "text") {
                return <AssistantMarkdown key={i}>{part.text}</AssistantMarkdown>
              }
              if (isToolUIPart(part)) {
                return (
                  <ToolPart
                    key={i}
                    part={part as React.ComponentProps<typeof ToolPart>["part"]}
                    onApprovalResponse={onApprovalResponse}
                  />
                )
              }
              return null
            })}
          </div>
        )
      )}
      {isStreaming && (
        <div
          className={cn(
            "flex items-center gap-1 text-muted-foreground",
            "[&>span]:size-1.5 [&>span]:rounded-full [&>span]:bg-current [&>span]:animate-pulse"
          )}
        >
          <span />
          <span className="[animation-delay:150ms]" />
          <span className="[animation-delay:300ms]" />
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  )
}
