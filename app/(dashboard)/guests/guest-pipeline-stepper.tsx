import type { GuestPipelineStatus } from "@/lib/guest-utils"

const PIPELINE_STAGES_DEFAULT: GuestPipelineStatus[] = ["New", "EventAttendee", "Matched", "Pending", "Member"]
const PIPELINE_STAGES_DECLINED: GuestPipelineStatus[] = ["New", "EventAttendee", "Declined", "Pending", "Member"]

const STAGE_LABEL: Record<GuestPipelineStatus, string> = {
  New: "New",
  EventAttendee: "Event Attendee",
  Matched: "Matched",
  Declined: "Declined",
  Pending: "Pending",
  Member: "Member",
}

const STAGE_DESCRIPTION: Record<GuestPipelineStatus, string> = {
  New: "Registered but has not yet attended an event.",
  EventAttendee: "Has attended at least one event but hasn't been placed in a breakout group yet.",
  Matched: "Was placed in a breakout group at an event and is ready to be connected to a DGroup.",
  Declined: "Was placed in a breakout group but membership was declined by the group leader. Assign to another DGroup.",
  Pending: "Has a pending DGroup assignment — awaiting confirmation from the group leader.",
  Member: "Has joined a DGroup and been promoted to a full member.",
}

const CHEVRON = 18

export function GuestPipelineStepper({ status }: { status: GuestPipelineStatus }) {
  const isDeclined = status === "Declined"
  const stages = isDeclined ? PIPELINE_STAGES_DECLINED : PIPELINE_STAGES_DEFAULT
  const activeIndex = stages.indexOf(status)

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex">
        {stages.map((stage, i) => {
          const isActive = i === activeIndex
          const isPast = i < activeIndex
          const isFirst = i === 0
          const isLast = i === stages.length - 1

          const clipPath = isFirst
            ? `polygon(0 0, calc(100% - ${CHEVRON}px) 0, 100% 50%, calc(100% - ${CHEVRON}px) 100%, 0 100%)`
            : isLast
            ? `polygon(0 0, 100% 0, 100% 100%, 0 100%, ${CHEVRON}px 50%)`
            : `polygon(0 0, calc(100% - ${CHEVRON}px) 0, 100% 50%, calc(100% - ${CHEVRON}px) 100%, 0 100%, ${CHEVRON}px 50%)`

          return (
            <div
              key={stage}
              className={[
                "relative flex flex-1 items-center select-none text-xs transition-colors",
                isActive && isDeclined
                  ? "bg-destructive/10 text-destructive"
                  : isActive
                  ? "bg-primary/15 text-primary"
                  : isPast
                  ? "bg-muted/70 text-foreground/45"
                  : "bg-muted/25 text-muted-foreground/50",
              ].join(" ")}
              style={{
                clipPath,
                marginLeft: i > 0 ? `-${CHEVRON}px` : undefined,
                zIndex: stages.length - i,
                paddingTop: 10,
                paddingBottom: 10,
                paddingLeft: isFirst ? 16 : CHEVRON + 10,
                paddingRight: isLast ? 16 : CHEVRON + 10,
              }}
            >
              {isActive && (
                <span className="mr-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-current animate-pulse" />
              )}
              <span className={["whitespace-nowrap", isActive ? "font-semibold" : "font-medium"].join(" ")}>
                {STAGE_LABEL[stage]}
              </span>
            </div>
          )
        })}
      </div>
      <div className="border-t bg-muted/30 px-4 py-2.5">
        <p className="text-xs text-muted-foreground">{STAGE_DESCRIPTION[status]}</p>
      </div>
    </div>
  )
}
