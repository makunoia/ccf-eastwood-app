import type { ReactNode } from "react"

type TimelineEntryProps = {
  icon: ReactNode
  isLast: boolean
  children: ReactNode
}

export function TimelineEntry({ icon, isLast, children }: TimelineEntryProps) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center shrink-0">
        <span className="mt-0.5">{icon}</span>
        {!isLast && <div className="w-px flex-1 bg-border mt-1" />}
      </div>
      <div className={`flex-1 min-w-0 space-y-0.5 ${isLast ? "pb-0" : "pb-5"}`}>
        {children}
      </div>
    </div>
  )
}
