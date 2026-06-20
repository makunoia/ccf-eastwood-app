import Link from "next/link"
import type { Icon } from "@tabler/icons-react"
import { Badge } from "@/components/ui/badge"
import { SettingCard } from "@/components/ui/setting-card"

export type FormListRow = {
  key: string
  label: string
  description: string
  href: string
  isOpen: boolean
  icon: Icon
}

export function FormsList({ rows }: { rows: FormListRow[] }) {
  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => (
        <SettingCard
          key={row.key}
          icon={row.icon}
          title={
            <Link
              href={row.href}
              className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
            >
              {row.label}
            </Link>
          }
          description={row.description}
          control={
            <Badge variant={row.isOpen ? "default" : "secondary"}>
              {row.isOpen ? "Open" : "Closed"}
            </Badge>
          }
        />
      ))}
    </div>
  )
}
