import Link from "next/link"
import { IconAdjustmentsHorizontal, IconTags } from "@tabler/icons-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const sections = [
  {
    title: "Life Stages",
    description: "Configure the life stage categories used for members and ministries",
    icon: IconTags,
    href: "/settings/life-stages",
  },
  {
    title: "Matching Weights",
    description: "Tune the scoring weights used to suggest small group and breakout group assignments",
    icon: IconAdjustmentsHorizontal,
    href: "/settings/matching",
  },
]

export default function SettingsPage() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h2 className="text-xl font-semibold">Settings</h2>
        <p className="text-sm text-muted-foreground">Configure application-wide settings</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => (
          <Link key={section.href} href={section.href}>
            <Card className="h-full transition-colors hover:bg-muted/50">
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <CardTitle className="text-base">{section.title}</CardTitle>
                  <CardDescription>{section.description}</CardDescription>
                </div>
                <section.icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
