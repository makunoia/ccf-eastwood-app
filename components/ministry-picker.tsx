"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

export type MinistryOption = {
  id: string
  name: string
  logoUrl: string | null
}

type Props = {
  ministries: MinistryOption[]
  selectedIds: string[]
  allMinistries: boolean
  onChange: (next: { ministryIds: string[]; allMinistries: boolean }) => void
}

/** Two initials from the ministry name, for ministries with no logo uploaded. */
function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("")
}

function MinistryAvatar({ ministry }: { ministry: MinistryOption }) {
  if (ministry.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={ministry.logoUrl}
        alt=""
        className="size-8 shrink-0 rounded-md border bg-muted object-contain p-0.5"
      />
    )
  }
  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted text-[10px] font-medium text-foreground/60">
      {initialsFor(ministry.name)}
    </div>
  )
}

/**
 * Ministry selection for an event, shared by Add Event and Event Settings → Details.
 *
 * Three states, not two: no selection means ministry-agnostic, a selection means
 * those ministries, and "All Ministries" means church-wide — including ministries
 * created after this event. Ticking All clears the individual picks rather than
 * expanding into them, so the flag stays the stored fact.
 */
export function MinistryPicker({
  ministries,
  selectedIds,
  allMinistries,
  onChange,
}: Props) {
  if (ministries.length === 0) {
    return (
      <div className="space-y-2">
        <Label>Ministry</Label>
        <p className="text-sm text-muted-foreground">No ministries configured.</p>
      </div>
    )
  }

  function toggleMinistry(id: string, checked: boolean) {
    onChange({
      allMinistries: false,
      ministryIds: checked
        ? [...selectedIds, id]
        : selectedIds.filter((existing) => existing !== id),
    })
  }

  return (
    <div className="space-y-2">
      <Label>Ministry</Label>
      <p className="text-xs text-muted-foreground">
        Pick the ministries running this event, choose All Ministries for a
        church-wide event, or leave everything unchecked for a ministry-agnostic one.
      </p>

      <div className="overflow-hidden rounded-md border">
        <label
          htmlFor="ministry-all"
          className="flex cursor-pointer items-center gap-3 border-b bg-muted/40 p-3"
        >
          <Checkbox
            id="ministry-all"
            checked={allMinistries}
            onCheckedChange={(checked) =>
              onChange({
                allMinistries: checked === true,
                ministryIds: checked === true ? [] : selectedIds,
              })
            }
          />
          <div className="min-w-0">
            <p className="text-sm font-medium leading-none">All Ministries</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Church-wide — covers ministries added later too.
            </p>
          </div>
        </label>

        <div
          className={cn(
            "divide-y",
            allMinistries && "pointer-events-none opacity-50"
          )}
        >
          {ministries.map((ministry) => (
            <label
              key={ministry.id}
              htmlFor={`ministry-${ministry.id}`}
              className="flex cursor-pointer items-center gap-3 p-3"
            >
              <Checkbox
                id={`ministry-${ministry.id}`}
                checked={!allMinistries && selectedIds.includes(ministry.id)}
                disabled={allMinistries}
                onCheckedChange={(checked) =>
                  toggleMinistry(ministry.id, checked === true)
                }
              />
              <MinistryAvatar ministry={ministry} />
              <span className="text-sm leading-none">{ministry.name}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
