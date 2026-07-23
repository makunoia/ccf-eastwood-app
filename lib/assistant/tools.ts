// Assistant tool definitions. Each tool closes over the request's session and
// re-checks the relevant FeatureArea permission before touching data — the
// assistant is SuperAdmin-only in v1, but the checks make opening it to Staff
// a UI change, not a security change.
//
// Write tools delegate to the existing server actions, which independently
// re-run requireWrite() + Zod validation — approval UI is UX, not the gate.

import { tool } from "ai"
import { z } from "zod"
import type { Session } from "next-auth"
import { canAccessEvent, canRead, canWrite, type FeatureArea } from "@/lib/permissions"
import { checkDuplicateContactInfo } from "@/lib/duplicate-check"
import { matchSmallGroups } from "@/lib/matching"
import { isoDate, toAssistantMatchRow } from "./serializers"
import {
  getEntityCounts,
  getEventAttendanceStats,
  getEventDetail,
  getGuestDetail,
  getMemberDetail,
  getSmallGroupDetail,
  listLifeStages,
  queryEventRegistrants,
  queryEvents,
  queryGuests,
  queryMembers,
  queryMinistries,
  querySmallGroups,
  queryVolunteers,
} from "./queries"
import { createMember, updateMember } from "@/app/(dashboard)/members/actions"
import {
  createGuest,
  updateGuest,
  promoteGuestToMember,
} from "@/app/(dashboard)/guests/actions"
import {
  addMemberToGroup,
  assignGuestToGroupTemporarily,
} from "@/app/(dashboard)/small-groups/actions"
import {
  markRegistrantAttended,
  markRegistrantPaid,
} from "@/app/(dashboard)/events/actions"
import type { MemberFormValues } from "@/lib/validations/member"
import type { GuestFormValues } from "@/lib/validations/guest"
import { db } from "@/lib/db"

/** Tool names that must pause for user approval before executing. */
export const WRITE_TOOL_NAMES = [
  "create_member",
  "update_member",
  "create_guest",
  "update_guest",
  "promote_guest_to_member",
  "add_member_to_small_group",
  "assign_guest_to_group_temporarily",
  "mark_registrant_paid",
  "mark_registrant_attended",
] as const

export type WriteToolName = (typeof WRITE_TOOL_NAMES)[number]

/** toolApproval map for ToolLoopAgent — every write tool needs user approval. */
export function buildToolApproval(): Record<WriteToolName, "user-approval"> {
  return Object.fromEntries(
    WRITE_TOOL_NAMES.map((name) => [name, "user-approval"])
  ) as Record<WriteToolName, "user-approval">
}

const PERMISSION_DENIED = (feature: string) => ({
  error: `You do not have access to ${feature}.`,
})

const limitField = z
  .number()
  .int()
  .min(1)
  .max(50)
  .optional()
  .describe("Max rows to return (default 20, max 50)")

// Shared person-field fragments for create/update inputs.
const personCreateFields = {
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  nickname: z.string().optional(),
  email: z.string().optional().describe("Email address"),
  phone: z.string().optional().describe("Mobile number, any PH format"),
  notes: z.string().optional(),
  lifeStageId: z.string().optional().describe("Use list_life_stages to resolve"),
  gender: z.enum(["Male", "Female"]).optional(),
  language: z.array(z.string()).optional(),
  birthMonth: z.number().int().min(1).max(12).optional(),
  birthYear: z.number().int().min(1900).max(2100).optional(),
  workCity: z.string().optional(),
  workIndustry: z.string().optional(),
  meetingPreference: z.enum(["Online", "Hybrid", "InPerson"]).optional(),
}

const personPatchFields = {
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  nickname: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
  lifeStageId: z.string().optional(),
  gender: z.enum(["Male", "Female"]).optional(),
  language: z.array(z.string()).optional(),
  birthMonth: z.number().int().min(1).max(12).optional(),
  birthYear: z.number().int().min(1900).max(2100).optional(),
  workCity: z.string().optional(),
  workIndustry: z.string().optional(),
  meetingPreference: z.enum(["Online", "Hybrid", "InPerson"]).optional(),
}

const str = (v: string | null | undefined) => v ?? ""
const numStr = (v: number | null | undefined) => (v == null ? "" : String(v))

export function buildAssistantTools(session: Session) {
  const read = (feature: FeatureArea) => canRead(session, feature)
  const write = (feature: FeatureArea) => canWrite(session, feature)

  return {
    // ── Read tools ───────────────────────────────────────────────────────────

    list_life_stages: tool({
      description:
        "List the configured life stages (id + name). Use to resolve lifeStageId inputs for other tools.",
      inputSchema: z.object({}),
      execute: async () => listLifeStages(),
    }),

    search_members: tool({
      description:
        "Search church members by name, nickname, email, or mobile number. Filter by life stage, gender, or small-group membership.",
      inputSchema: z.object({
        query: z.string().optional().describe("Name, email, or mobile number"),
        lifeStageId: z.string().optional(),
        gender: z.enum(["Male", "Female"]).optional(),
        inSmallGroup: z.boolean().optional().describe("true = only members in a group"),
        limit: limitField,
      }),
      execute: async (input) => {
        if (!read("Members")) return PERMISSION_DENIED("Members")
        return queryMembers(input)
      },
    }),

    get_member_details: tool({
      description:
        "Full profile of one member: contact info, matching profile, DGroup, led groups, and recent event registrations.",
      inputSchema: z.object({ memberId: z.string() }),
      execute: async ({ memberId }) => {
        if (!read("Members")) return PERMISSION_DENIED("Members")
        const detail = await getMemberDetail(memberId)
        return detail ?? { error: "Member not found." }
      },
    }),

    search_guests: tool({
      description:
        "Search guests (pre-membership contacts) by name, email, or mobile number. status defaults to 'active' (not yet promoted to member).",
      inputSchema: z.object({
        query: z.string().optional(),
        lifeStageId: z.string().optional(),
        status: z.enum(["active", "promoted", "all"]).optional(),
        limit: limitField,
      }),
      execute: async (input) => {
        if (!read("Guests")) return PERMISSION_DENIED("Guests")
        return queryGuests(input)
      },
    }),

    get_guest_details: tool({
      description:
        "Full profile of one guest: contact info, matching profile, claimed group, pending group requests, and recent event registrations.",
      inputSchema: z.object({ guestId: z.string() }),
      execute: async ({ guestId }) => {
        if (!read("Guests")) return PERMISSION_DENIED("Guests")
        const detail = await getGuestDetail(guestId)
        return detail ?? { error: "Guest not found." }
      },
    }),

    check_duplicate_contact: tool({
      description:
        "Check whether a phone or email already belongs to an existing member or guest. Always call this before create_member or create_guest.",
      inputSchema: z.object({
        phone: z.string().optional(),
        email: z.string().optional(),
      }),
      execute: async ({ phone, email }) => {
        if (!read("Members") || !read("Guests"))
          return PERMISSION_DENIED("Members and Guests")
        return checkDuplicateContactInfo({ phone, email })
      },
    }),

    search_small_groups: tool({
      description:
        "Search DGroups by group or leader name. Filter by life stage, meeting day (0=Sunday…6=Saturday), or group type.",
      inputSchema: z.object({
        query: z.string().optional(),
        lifeStageId: z.string().optional(),
        dayOfWeek: z.number().int().min(0).max(6).optional(),
        groupType: z.enum(["Regular", "Couples"]).optional(),
        limit: limitField,
      }),
      execute: async (input) => {
        if (!read("SmallGroups")) return PERMISSION_DENIED("DGroups")
        return querySmallGroups(input)
      },
    }),

    get_small_group_details: tool({
      description:
        "Full detail of one DGroup: leader, matching attributes, schedule, full roster, and pending member requests.",
      inputSchema: z.object({ groupId: z.string() }),
      execute: async ({ groupId }) => {
        if (!read("SmallGroups")) return PERMISSION_DENIED("DGroups")
        const detail = await getSmallGroupDetail(groupId)
        return detail ?? { error: "DGroup not found." }
      },
    }),

    match_small_groups: tool({
      description:
        "Run the matching engine to suggest compatible DGroups for a guest or a member (exactly one of guestId/memberId). Returns ranked matches with 0–1 scores.",
      inputSchema: z
        .object({
          guestId: z.string().optional(),
          memberId: z.string().optional(),
          limit: z.number().int().min(1).max(10).optional(),
        })
        .refine((v) => (v.guestId ? !v.memberId : !!v.memberId), {
          message: "Provide exactly one of guestId or memberId",
        }),
      execute: async ({ guestId, memberId, limit }) => {
        if (!read("SmallGroups")) return PERMISSION_DENIED("DGroups")
        if (guestId && !read("Guests")) return PERMISSION_DENIED("Guests")
        if (memberId && !read("Members")) return PERMISSION_DENIED("Members")
        const params = guestId ? { guestId } : { memberId: memberId! }
        const results = await matchSmallGroups(params, { limit: limit ?? 5 })
        return { matches: results.map(toAssistantMatchRow) }
      },
    }),

    list_ministries: tool({
      description: "List ministries with their life stage and linked event count.",
      inputSchema: z.object({
        query: z.string().optional(),
        limit: limitField,
      }),
      execute: async (input) => {
        if (!read("Ministries")) return PERMISSION_DENIED("Ministries")
        return queryMinistries(input)
      },
    }),

    search_events: tool({
      description:
        "Search events by name. timeframe: 'upcoming' (default ordering soonest-first), 'past' (most recent first), or 'all'.",
      inputSchema: z.object({
        query: z.string().optional(),
        timeframe: z.enum(["upcoming", "past", "all"]).optional(),
        limit: limitField,
      }),
      execute: async (input) => {
        if (!read("Events")) return PERMISSION_DENIED("Events")
        return queryEvents(input)
      },
    }),

    get_event_details: tool({
      description:
        "Full detail of one event: schedule, price, modules, ministries, and registrant/payment/attendance counts.",
      inputSchema: z.object({ eventId: z.string() }),
      execute: async ({ eventId }) => {
        if (!read("Events") || !canAccessEvent(session, eventId))
          return PERMISSION_DENIED("this event")
        const detail = await getEventDetail(eventId)
        return detail ?? { error: "Event not found." }
      },
    }),

    get_event_attendance_stats: tool({
      description:
        "Attendance statistics for an event. For MultiDay/Recurring events returns per-session attendee counts (chartable); for OneTime events returns attended totals.",
      inputSchema: z.object({ eventId: z.string() }),
      execute: async ({ eventId }) => {
        if (!read("Events") || !canAccessEvent(session, eventId))
          return PERMISSION_DENIED("this event")
        const stats = await getEventAttendanceStats(eventId)
        return stats ?? { error: "Event not found." }
      },
    }),

    search_event_registrants: tool({
      description:
        "List/search the registrants of one event by name. Filter by payment or attendance status. Use this to resolve registrantId before marking paid/attended.",
      inputSchema: z.object({
        eventId: z.string(),
        query: z.string().optional(),
        isPaid: z.boolean().optional(),
        attended: z.boolean().optional(),
        limit: limitField,
      }),
      execute: async (input) => {
        if (!read("Events") || !canAccessEvent(session, input.eventId))
          return PERMISSION_DENIED("this event")
        return queryEventRegistrants(input)
      },
    }),

    search_volunteers: tool({
      description:
        "Search volunteers by member name; filter by event and approval status.",
      inputSchema: z.object({
        eventId: z.string().optional(),
        query: z.string().optional(),
        status: z.enum(["Pending", "Confirmed", "Rejected"]).optional(),
        limit: limitField,
      }),
      execute: async (input) => {
        if (!read("Volunteers")) return PERMISSION_DENIED("Volunteers")
        if (input.eventId && !canAccessEvent(session, input.eventId))
          return PERMISSION_DENIED("this event")
        return queryVolunteers(input)
      },
    }),

    get_entity_counts: tool({
      description:
        "Overview counts: total members, active guests, DGroups, ministries, upcoming events, and volunteers.",
      inputSchema: z.object({}),
      execute: async () =>
        getEntityCounts({
          members: read("Members"),
          guests: read("Guests"),
          smallGroups: read("SmallGroups"),
          ministries: read("Ministries"),
          events: read("Events"),
          volunteers: read("Volunteers"),
        }),
    }),

    // ── Write tools (all require user approval — see buildToolApproval) ──────

    create_member: tool({
      description:
        "Create a new church member. Requires user approval. Call check_duplicate_contact first when phone/email is provided.",
      inputSchema: z.object({
        ...personCreateFields,
        address: z.string().optional(),
        dateJoined: z
          .string()
          .optional()
          .describe("YYYY-MM-DD; defaults to today"),
      }),
      execute: async (input) => {
        if (!write("Members")) return PERMISSION_DENIED("Members")
        const form: MemberFormValues = {
          firstName: input.firstName,
          lastName: input.lastName,
          nickname: str(input.nickname),
          email: str(input.email),
          phone: str(input.phone),
          address: str(input.address),
          dateJoined: input.dateJoined ?? new Date().toISOString().slice(0, 10),
          notes: str(input.notes),
          lifeStageId: str(input.lifeStageId),
          gender: str(input.gender),
          language: input.language ?? [],
          birthMonth: numStr(input.birthMonth),
          birthYear: numStr(input.birthYear),
          workCity: str(input.workCity),
          workIndustry: str(input.workIndustry),
          meetingPreference: str(input.meetingPreference),
        }
        return createMember(form)
      },
    }),

    update_member: tool({
      description:
        "Update fields on an existing member. Requires user approval. Only pass the fields to change.",
      inputSchema: z.object({
        memberId: z.string(),
        patch: z.object({ ...personPatchFields, address: z.string().optional() }),
      }),
      execute: async ({ memberId, patch }) => {
        if (!write("Members")) return PERMISSION_DENIED("Members")
        const m = await db.member.findUnique({ where: { id: memberId } })
        if (!m) return { success: false as const, error: "Member not found." }
        const p = patch
        const form: MemberFormValues = {
          firstName: p.firstName ?? m.firstName,
          lastName: p.lastName ?? m.lastName,
          nickname: p.nickname ?? str(m.nickname),
          email: p.email ?? str(m.email),
          phone: p.phone ?? str(m.phone),
          address: p.address ?? str(m.address),
          dateJoined: isoDate(m.dateJoined) ?? "",
          notes: p.notes ?? str(m.notes),
          lifeStageId: p.lifeStageId ?? str(m.lifeStageId),
          gender: p.gender ?? str(m.gender),
          language: p.language ?? m.language,
          birthMonth: p.birthMonth !== undefined ? String(p.birthMonth) : numStr(m.birthMonth),
          birthYear: p.birthYear !== undefined ? String(p.birthYear) : numStr(m.birthYear),
          workCity: p.workCity ?? str(m.workCity),
          workIndustry: p.workIndustry ?? str(m.workIndustry),
          meetingPreference: p.meetingPreference ?? str(m.meetingPreference),
        }
        return updateMember(memberId, form)
      },
    }),

    create_guest: tool({
      description:
        "Create a new guest (pre-membership contact). Requires user approval. Call check_duplicate_contact first when phone/email is provided.",
      inputSchema: z.object(personCreateFields),
      execute: async (input) => {
        if (!write("Guests")) return PERMISSION_DENIED("Guests")
        const form: GuestFormValues = {
          firstName: input.firstName,
          lastName: input.lastName,
          nickname: str(input.nickname),
          email: str(input.email),
          phone: str(input.phone),
          notes: str(input.notes),
          lifeStageId: str(input.lifeStageId),
          gender: str(input.gender),
          language: input.language ?? [],
          birthMonth: numStr(input.birthMonth),
          birthYear: numStr(input.birthYear),
          workCity: str(input.workCity),
          workIndustry: str(input.workIndustry),
          meetingPreference: str(input.meetingPreference),
        }
        return createGuest(form)
      },
    }),

    update_guest: tool({
      description:
        "Update fields on an existing guest. Requires user approval. Only pass the fields to change.",
      inputSchema: z.object({
        guestId: z.string(),
        patch: z.object(personPatchFields),
      }),
      execute: async ({ guestId, patch }) => {
        if (!write("Guests")) return PERMISSION_DENIED("Guests")
        const g = await db.guest.findUnique({ where: { id: guestId } })
        if (!g) return { success: false as const, error: "Guest not found." }
        const p = patch
        const form: GuestFormValues = {
          firstName: p.firstName ?? g.firstName,
          lastName: p.lastName ?? g.lastName,
          nickname: p.nickname ?? str(g.nickname),
          email: p.email ?? str(g.email),
          phone: p.phone ?? str(g.phone),
          notes: p.notes ?? str(g.notes),
          lifeStageId: p.lifeStageId ?? str(g.lifeStageId),
          gender: p.gender ?? str(g.gender),
          language: p.language ?? g.language,
          birthMonth: p.birthMonth !== undefined ? String(p.birthMonth) : numStr(g.birthMonth),
          birthYear: p.birthYear !== undefined ? String(p.birthYear) : numStr(g.birthYear),
          workCity: p.workCity ?? str(g.workCity),
          workIndustry: p.workIndustry ?? str(g.workIndustry),
          meetingPreference: p.meetingPreference ?? str(g.meetingPreference),
        }
        return updateGuest(guestId, form)
      },
    }),

    promote_guest_to_member: tool({
      description:
        "Promote a guest to member by adding them to a DGroup. Requires user approval. Creates the Member record and links history.",
      inputSchema: z.object({
        guestId: z.string(),
        groupId: z.string().describe("The DGroup the new member joins"),
      }),
      execute: async ({ guestId, groupId }) => {
        if (!write("Guests")) return PERMISSION_DENIED("Guests")
        if (!write("SmallGroups")) return PERMISSION_DENIED("DGroups")
        return promoteGuestToMember(guestId, groupId)
      },
    }),

    add_member_to_small_group: tool({
      description:
        "Add an existing member to a DGroup (members belong to at most one group). Requires user approval.",
      inputSchema: z.object({
        memberId: z.string(),
        groupId: z.string(),
      }),
      execute: async ({ memberId, groupId }) => {
        if (!write("SmallGroups")) return PERMISSION_DENIED("DGroups")
        return addMemberToGroup(groupId, memberId)
      },
    }),

    assign_guest_to_group_temporarily: tool({
      description:
        "Create a pending (temporary) assignment of a guest to a DGroup, awaiting leader confirmation. Requires user approval.",
      inputSchema: z.object({
        guestId: z.string(),
        groupId: z.string(),
      }),
      execute: async ({ guestId, groupId }) => {
        if (!write("SmallGroups")) return PERMISSION_DENIED("DGroups")
        return assignGuestToGroupTemporarily(groupId, guestId)
      },
    }),

    mark_registrant_paid: tool({
      description:
        "Mark an event registrant as paid with a payment reference. Requires user approval. Resolve registrantId with search_event_registrants first.",
      inputSchema: z.object({
        eventId: z.string(),
        registrantId: z.string(),
        paymentReference: z.string().min(1),
      }),
      execute: async ({ eventId, registrantId, paymentReference }) => {
        if (!write("Events") || !canAccessEvent(session, eventId))
          return PERMISSION_DENIED("this event")
        return markRegistrantPaid(registrantId, paymentReference, eventId)
      },
    }),

    mark_registrant_attended: tool({
      description:
        "Mark an event registrant as attended (OneTime events). Requires user approval. Resolve registrantId with search_event_registrants first.",
      inputSchema: z.object({
        eventId: z.string(),
        registrantId: z.string(),
      }),
      execute: async ({ eventId, registrantId }) => {
        if (!write("Events") || !canAccessEvent(session, eventId))
          return PERMISSION_DENIED("this event")
        return markRegistrantAttended(registrantId, eventId)
      },
    }),
  }
}

export type AssistantTools = ReturnType<typeof buildAssistantTools>
