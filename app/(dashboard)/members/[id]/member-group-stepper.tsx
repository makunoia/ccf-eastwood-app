const STAGES = ["Member", "Timothy", "Leader"] as const
type Stage = (typeof STAGES)[number]

const STAGE_LABEL: Record<Stage, string> = {
  Member:  "Member",
  Timothy: "Timothy",
  Leader:  "Leader",
}

const STAGE_DESCRIPTION: Record<Stage, string> = {
  Member:  "Active member of this DGroup.",
  Timothy: "Being mentored and developed toward a future leadership role.",
  Leader:  "Leading this DGroup.",
}

export function MemberGroupStepper({ status }: { status: Stage }) {
  const activeIndex = STAGES.indexOf(status)
  const CHEVRON = 18

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex">
        {STAGES.map((stage, i) => {
        const isActive = i === activeIndex
        const isPast = i < activeIndex
        const isFirst = i === 0
        const isLast = i === STAGES.length - 1

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
              isActive
                ? "bg-primary/15 text-primary"
                : isPast
                ? "bg-muted/70 text-foreground/45"
                : "bg-muted/25 text-muted-foreground/50",
            ].join(" ")}
            style={{
              clipPath,
              marginLeft: i > 0 ? `-${CHEVRON}px` : undefined,
              zIndex: STAGES.length - i,
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
