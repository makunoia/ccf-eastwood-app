import {
  IconClipboardList,
  IconDoorEnter,
  IconFish,
  IconHeartHandshake,
  IconShieldCheck,
  IconUserCircle,
  IconUserEdit,
  IconUsersGroup,
  type Icon,
} from "@tabler/icons-react"
import type { EventModuleType, FormKey } from "@/app/generated/prisma/client"

export type FormScope = "global" | "event"

export type FormThemeField =
  | "logoUrl"
  | "bannerUrl"
  | "primaryColor"
  | "title"
  | "description"

export type FormMeta = {
  key: FormKey
  label: string
  description: string
  scope: FormScope
  icon: Icon
  /** Browseable public entry URL. Omitted for purely token-gated forms. */
  publicPath?: (eventId?: string) => string
  /** Generic theme-override fields surfaced in the editor. */
  themeFields: FormThemeField[]
  /** EventRegistration uses its dedicated Event columns + relocated tabs instead. */
  usesDedicatedConfig?: boolean
  /** Event form only listed when this module is enabled on the event. */
  requiresEventModule?: EventModuleType
}

export const FORM_REGISTRY: Record<FormKey, FormMeta> = {
  JoinSmallGroup: {
    key: "JoinSmallGroup",
    label: "Join a DGroup",
    description:
      "Public page where guests share their preferences and request to join a DGroup.",
    scope: "global",
    icon: IconDoorEnter,
    publicPath: () => "/join-small-group",
    themeFields: ["logoUrl", "bannerUrl", "primaryColor", "title", "description"],
  },
  MemberSelfService: {
    key: "MemberSelfService",
    label: "Member Portal",
    description:
      "Self-service page where members verify by mobile to view and manage their DGroup.",
    scope: "global",
    icon: IconUserCircle,
    publicPath: () => "/me",
    themeFields: [],
  },
  SmallGroupConfirmation: {
    key: "SmallGroupConfirmation",
    label: "DGroup Confirmation",
    description:
      "Page where DGroup leaders verify by mobile to confirm pending member requests.",
    scope: "global",
    icon: IconUsersGroup,
    publicPath: () => "/small-group-confirmation",
    themeFields: [],
  },
  EventRegistration: {
    key: "EventRegistration",
    label: "Registration Form",
    description:
      "Public registration form and page. Configure which fields appear and the page banner & copy.",
    scope: "event",
    icon: IconClipboardList,
    publicPath: (eventId) => `/events/${eventId}/register`,
    themeFields: [],
    usesDedicatedConfig: true,
  },
  VolunteerSignUp: {
    key: "VolunteerSignUp",
    label: "Volunteer Sign-up",
    description:
      "Public form where people sign up to volunteer for this event and pick a preferred role.",
    scope: "event",
    icon: IconHeartHandshake,
    publicPath: (eventId) => `/events/${eventId}/volunteer`,
    themeFields: [],
  },
  VolunteerInfo: {
    key: "VolunteerInfo",
    label: "Volunteer Info Update",
    description:
      "Link volunteers use to update their personal info, DGroup membership, and availability.",
    scope: "event",
    icon: IconUserEdit,
    publicPath: (eventId) => `/events/${eventId}/volunteer-info`,
    themeFields: ["logoUrl", "bannerUrl", "primaryColor", "title", "description"],
  },
  VolunteerApproval: {
    key: "VolunteerApproval",
    label: "Volunteer Approval",
    description:
      "Per-volunteer link a DGroup leader opens to approve or reject a volunteer sign-up.",
    scope: "event",
    icon: IconShieldCheck,
    themeFields: [],
  },
  CatchMech: {
    key: "CatchMech",
    label: "Catch Mech",
    description:
      "Facilitator check-in that confirms breakout members into DGroups via a weekly link.",
    scope: "event",
    icon: IconFish,
    publicPath: (eventId) => `/events/${eventId}/catch-mech`,
    themeFields: ["logoUrl", "bannerUrl", "primaryColor", "title", "description"],
    requiresEventModule: "CatchMech",
  },
}

export const GLOBAL_FORMS: FormMeta[] = Object.values(FORM_REGISTRY).filter(
  (f) => f.scope === "global"
)

export const EVENT_FORMS: FormMeta[] = Object.values(FORM_REGISTRY).filter(
  (f) => f.scope === "event"
)

/** Deterministic unique key for a form config row. */
export function scopeKeyFor(key: FormKey, eventId?: string | null): string {
  return eventId ? `${eventId}:${key}` : `global:${key}`
}

/** Event forms visible for an event given its enabled modules. */
export function eventFormsForModules(modules: EventModuleType[]): FormMeta[] {
  return EVENT_FORMS.filter(
    (f) => !f.requiresEventModule || modules.includes(f.requiresEventModule)
  )
}
