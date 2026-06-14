"use client"

import * as React from "react"
import { toast } from "sonner"
import { IconHourglass } from "@tabler/icons-react"
import { Input } from "@/components/ui/input"
import { updateGuestCooldownDays } from "./actions"

type Props = { initial: number }

export function GuestCooldownForm({ initial }: Props) {
  const [days, setDays] = React.useState(String(initial))
  const [saving, setSaving] = React.useState(false)
  const isFirst = React.useRef(true)

  React.useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return }
    const parsed = Number(days)
    if (days === "" || !Number.isInteger(parsed) || parsed < 0) return
    const t = setTimeout(async () => {
      setSaving(true)
      const result = await updateGuestCooldownDays(parsed)
      setSaving(false)
      if (result.success) toast.success("Cooldown saved")
      else toast.error(result.error)
    }, 800)
    return () => clearTimeout(t)
  }, [days])

  const disabled = days === "0"

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Guest assignment cooldown
      </p>
      <div className="rounded-lg border px-4 py-3.5">
        <div className="flex items-center gap-4">
          <div
            className="flex size-9 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: disabled ? undefined : "#8b5cf618" }}
          >
            <IconHourglass
              className="size-4"
              style={{ color: disabled ? "hsl(var(--muted-foreground))" : "#8b5cf6" }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium leading-snug">Rest period after a new guest</p>
            <p className="text-xs text-muted-foreground leading-snug">
              Groups that just received a guest are skipped in suggestions for this
              many days, so other groups get a chance. Set to 0 to turn off.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Input
              type="number"
              min={0}
              max={365}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="w-20 text-right"
            />
            <span className="text-sm text-muted-foreground">days</span>
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {saving ? "Saving…" : "Changes are saved automatically."}
      </p>
    </div>
  )
}
