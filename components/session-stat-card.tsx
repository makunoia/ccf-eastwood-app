import type { ReactNode } from "react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export function StatCard({
  label,
  value,
  icon,
  genderBar,
}: {
  label: string
  value: ReactNode
  icon: ReactNode
  genderBar?: { men: number; women: number }
}) {
  const genderTotal = (genderBar?.men ?? 0) + (genderBar?.women ?? 0)
  return (
    <div className="relative flex flex-col gap-3 overflow-hidden rounded-lg border px-5 py-5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-muted-foreground">
          {label}
        </p>
        <span className="text-muted-foreground/40">{icon}</span>
      </div>
      <p className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
        {value}
      </p>
      {genderBar && genderTotal > 0 && (
        <TooltipProvider>
          <div className="absolute bottom-0 left-0 right-0 flex h-1">
            {genderBar.men > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="cursor-default bg-blue-400 transition-colors hover:bg-blue-500"
                    style={{ flex: genderBar.men }}
                  />
                </TooltipTrigger>
                <TooltipContent>{genderBar.men} men</TooltipContent>
              </Tooltip>
            )}
            {genderBar.women > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="cursor-default bg-pink-400 transition-colors hover:bg-pink-500"
                    style={{ flex: genderBar.women }}
                  />
                </TooltipTrigger>
                <TooltipContent>{genderBar.women} women</TooltipContent>
              </Tooltip>
            )}
          </div>
        </TooltipProvider>
      )}
    </div>
  )
}
