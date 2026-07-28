import {
  IconBus,
  IconCash,
  IconCross,
  IconFish,
  IconHeart,
  IconUsersGroup,
  type Icon,
} from "@tabler/icons-react"

import type { EventModuleType } from "@/app/generated/prisma/client"

/**
 * The icon and one-line explanation an admin reads for each event module.
 *
 * Shared by the create-event form's picker and Event Settings → Modules, so the
 * two descriptions of the same switch can't drift apart. Titles live in
 * `MODULE_LABELS` (`lib/events/modules.ts`) alongside the dependency graph — this
 * file is client-only because the icons are React components, and keeping them
 * out of `lib/events/modules.ts` is what lets server actions import that module.
 */
export const MODULE_META: Record<
  EventModuleType,
  { icon: Icon; description: string }
> = {
  Volunteers: {
    icon: IconHeart,
    description:
      "Sign up and organise the people serving at this event, with committees and roles.",
  },
  Breakout: {
    icon: IconUsersGroup,
    description: "Split attendees into smaller groups led by volunteer facilitators.",
  },
  Priced: {
    icon: IconCash,
    description:
      "Charge a registration fee. Adds a payment reference to the registration form and to every registrant.",
  },
  Baptism: {
    icon: IconCross,
    description:
      "Track registrants who will be baptized at this event. Managed mid-event by admin.",
  },
  Embarkation: {
    icon: IconBus,
    description: "Assign registrants and volunteers to buses. Print a manifest per bus.",
  },
  CatchMech: {
    icon: IconFish,
    description:
      "Enable facilitators to confirm breakout group members into their DGroups via a weekly link.",
  },
}
