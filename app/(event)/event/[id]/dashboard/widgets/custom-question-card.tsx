"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { WidgetProps } from "../shared"

export function CustomQuestionCard({ questionId, event }: WidgetProps & { questionId: string }) {
  const result = event.customQuestionResults.find((item) => item.questionId === questionId)
  const multiple = result?.type === "MultipleChoice"

  return (
    <Card>
      <CardHeader>
        <CardTitle className="break-words">{result?.title ?? "Custom step"}</CardTitle>
        <CardDescription className="break-words line-clamp-2">{result?.label ?? "Question results"}</CardDescription>
        <p className="pt-1 text-xs text-muted-foreground">
          {result?.totalResponses ?? 0} {result?.totalResponses === 1 ? "response" : "responses"} · {event.period === "all" ? "all time" : `last ${event.period.replace("d", "")} days`}
        </p>
      </CardHeader>
      <CardContent>
        {!result || result.totalResponses === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No answers in this period.</p>
        ) : result.choiceCounts.length > 0 ? (
          <div className="space-y-3">
            {multiple && <p className="text-xs text-muted-foreground">Percentages are of respondents; people may select more than one.</p>}
            {result.choiceCounts.map(({ option, count }) => {
              const percentage = Math.round((count / result.totalResponses) * 100)
              return (
                <div key={option} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">{option}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{count} · {percentage}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, percentage)}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Most recent answers</p>
            <ul className="space-y-2">
              {result.textSamples.map((answer, index) => (
                <li key={`${index}-${answer}`} className="break-words whitespace-pre-wrap line-clamp-3 rounded-md bg-muted/50 px-3 py-2 text-sm leading-5">{answer}</li>
              ))}
            </ul>
            {result.totalResponses > result.textSamples.length && (
              <p className="text-xs text-muted-foreground">Showing {result.textSamples.length} of {result.totalResponses} responses.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
