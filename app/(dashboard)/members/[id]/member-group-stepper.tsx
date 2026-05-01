const STAGES = ["Member", "Timothy", "Leader"] as const
type Stage = (typeof STAGES)[number]

const STAGE_LABEL: Record<Stage, string> = {
  Member:  "Member",
  Timothy: "Timothy",
  Leader:  "Leader",
}

const STAGE_DESCRIPTION: Record<Stage, string> = {
  Member:  "Active member of this small group.",
  Timothy: "Being mentored and developed toward a future leadership role.",
  Leader:  "Leading this small group.",
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
              "relative flex flex-1 items-center select-none text-xs",
              isActive
                ? "bg-foreground text-background"
                : isPast
                ? "bg-muted text-foreground/50"
                : "bg-muted/40 text-muted-foreground/60",
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
            <span className={isActive ? "font-semibold" : "font-medium"}>
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
