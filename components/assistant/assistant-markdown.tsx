"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

/** Markdown renderer for assistant text — no typography plugin, so styles are inline. */
export function AssistantMarkdown({ children }: { children: string }) {
  return (
    <div className="text-sm leading-relaxed [&>*+*]:mt-2">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: c }) => (
            <a
              href={href}
              className="underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
            >
              {c}
            </a>
          ),
          ul: ({ children: c }) => <ul className="list-disc pl-5 space-y-1">{c}</ul>,
          ol: ({ children: c }) => <ol className="list-decimal pl-5 space-y-1">{c}</ol>,
          code: ({ children: c }) => (
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{c}</code>
          ),
          h1: ({ children: c }) => <p className="font-semibold">{c}</p>,
          h2: ({ children: c }) => <p className="font-semibold">{c}</p>,
          h3: ({ children: c }) => <p className="font-semibold">{c}</p>,
          table: ({ children: c }) => (
            <div className="overflow-x-auto">
              <table className="w-full text-xs [&_th]:border-b [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_td]:px-2 [&_td]:py-1 [&_td]:border-b [&_td]:border-border/50">
                {c}
              </table>
            </div>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
