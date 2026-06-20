"use client"

import * as React from "react"
import { IconCash, IconSalad, IconSparkles, IconUsers } from "@tabler/icons-react"
import { toast } from "sonner"
import { SettingCard } from "@/components/ui/setting-card"
import { Switch } from "@/components/ui/switch"
import {
  setRegistrationFormModule,
  type RegistrationFormModule,
} from "@/app/(dashboard)/events/module-actions"

export type RegistrationFormModules = Record<RegistrationFormModule, boolean>

const FIELDS: {
  key: RegistrationFormModule
  icon: typeof IconUsers
  title: string
  description: string
}[] = [
  {
    key: "SmallGroup",
    icon: IconUsers,
    title: "Small Group",
    description:
      "Collect matching preferences so registrants can be placed into a Small Group or Breakout.",
  },
  {
    key: "Dietary",
    icon: IconSalad,
    title: "Dietary Restrictions",
    description:
      "Ask registrants whether they have dietary preferences (Vegetarian, Vegan, Halal, etc.).",
  },
  {
    key: "Payment",
    icon: IconCash,
    title: "Payment Reference",
    description:
      "Ask registrants for a payment reference (e.g. GCash transaction ID) on submission.",
  },
  {
    key: "AutoAssignBreakout",
    icon: IconSparkles,
    title: "Automatically assign breakout groups",
    description:
      "On submit, place each registrant into the best-fit breakout group based on Gender, Age, and remaining capacity. When off, registrants choose their own group (or skip).",
  },
]

export function RegistrationFormFields({
  eventId,
  initial,
}: {
  eventId: string
  initial: RegistrationFormModules
}) {
  const [formMods, setFormMods] = React.useState<RegistrationFormModules>(initial)
  const [toggling, setToggling] = React.useState<RegistrationFormModule | null>(null)

  async function handleToggle(module: RegistrationFormModule) {
    const next = !formMods[module]
    setToggling(module)
    const result = await setRegistrationFormModule(eventId, module, next)
    setToggling(null)
    if (result.success) {
      setFormMods((prev) => ({ ...prev, [module]: next }))
    } else {
      toast.error(result.error)
    }
  }

  return (
    <section className="space-y-4 max-w-2xl">
      <div>
        <h3 className="type-label text-muted-foreground">Public registration form</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Toggle which optional sections appear on this event&apos;s public registration form.
        </p>
      </div>

      {FIELDS.map((field) => (
        <SettingCard
          key={field.key}
          icon={field.icon}
          title={field.title}
          description={field.description}
          control={
            <Switch
              checked={formMods[field.key]}
              onCheckedChange={() => handleToggle(field.key)}
              disabled={toggling === field.key}
            />
          }
        />
      ))}
    </section>
  )
}
