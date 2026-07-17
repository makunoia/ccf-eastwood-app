"use client"

import * as React from "react"
import {
  IconPlayerStopFilled,
  IconPlus,
  IconSend2,
  IconSparkles,
} from "@tabler/icons-react"
import { useChat } from "@ai-sdk/react"
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { MessageList } from "./message-list"

export function AssistantPanel() {
  const [open, setOpen] = React.useState(false)
  const [input, setInput] = React.useState("")

  const {
    messages,
    sendMessage,
    status,
    stop,
    setMessages,
    addToolApprovalResponse,
    clearError,
  } = useChat({
    transport: new DefaultChatTransport({ api: "/api/assistant" }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onError: (error) => {
      toast.error(error.message || "The assistant hit an error. Please try again.")
    },
  })

  const isBusy = status === "submitted" || status === "streaming"

  function submit() {
    const text = input.trim()
    if (!text || isBusy) return
    setInput("")
    void sendMessage({ text })
  }

  function newConversation() {
    stop()
    clearError()
    setMessages([])
    setInput("")
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            className="fixed bottom-6 right-6 z-50 size-12 rounded-full shadow-lg"
            onClick={() => setOpen(true)}
            aria-label="Open AI Assistant"
          >
            <IconSparkles className="size-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">AI Assistant</TooltipContent>
      </Tooltip>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-[480px]"
        >
          <SheetHeader className="border-b px-4 py-3">
            <div className="flex items-center justify-between gap-2 pr-8">
              <SheetTitle className="flex items-center gap-1.5 text-base">
                <IconSparkles className="size-4" />
                AI Assistant
              </SheetTitle>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={newConversation}
                disabled={messages.length === 0}
              >
                <IconPlus className="size-3.5" />
                New conversation
              </Button>
            </div>
            <SheetDescription className="sr-only">
              Chat with the Churchie AI assistant
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <MessageList
              messages={messages}
              isStreaming={isBusy}
              onApprovalResponse={(id, approved) =>
                addToolApprovalResponse({ id, approved })
              }
            />
          </div>

          <div className="border-t p-3">
            <div className="flex items-end gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    submit()
                  }
                }}
                placeholder="Ask about members, events, groups…"
                className="max-h-32 min-h-9 resize-none text-sm"
                rows={1}
              />
              {isBusy ? (
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => stop()}
                  aria-label="Stop"
                >
                  <IconPlayerStopFilled className="size-4" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  onClick={submit}
                  disabled={!input.trim()}
                  aria-label="Send"
                >
                  <IconSend2 className="size-4" />
                </Button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
