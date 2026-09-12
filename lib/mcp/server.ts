import "server-only"

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { db } from "@/lib/db"
import { formatPhilippinePhone } from "@/lib/utils"
import {
  getEntityCounts,
  getEventAttendanceStats,
  getEventDetail,
  getFamilyDetail,
  getGuestDetail,
  getMemberDetail,
  getMinistryDetail,
  getSmallGroupDetail,
  getSmallGroupStats,
  getVolunteerDetail,
  listEventOccurrences,
  listLifeStages,
  queryEventRegistrants,
  queryEvents,
  queryGuests,
  queryMembers,
  queryMinistries,
  querySmallGroupRequests,
  querySmallGroups,
  queryVolunteers,
} from "@/lib/assistant/queries"
import { toAssistantMatchRow } from "@/lib/assistant/serializers"
import { checkDuplicateContactInfo } from "@/lib/duplicate-check"
import { matchSmallGroups } from "@/lib/matching"
import { actorCan, actorCanAccessEvent, type McpActor } from "./auth"
import { applySafeDGroupImport, confirmDGroupImportReview, undoSafeDGroupImport } from "./imports"
import { familyMemberSchema, familySchema } from "@/lib/validations/family"
import { guestSchema } from "@/lib/validations/guest"
import { memberSchema } from "@/lib/validations/member"
import { ministrySchema } from "@/lib/validations/ministry"
import { eventSchema } from "@/lib/validations/event"
import { smallGroupSchema } from "@/lib/validations/small-group"
import { createVolunteerSchema, updateVolunteerSchema } from "@/lib/validations/volunteer"
import { addMcpFamilyMember, moveMcpDGroupMember, mutateEvent, mutateFamily, mutateGuest, mutateMember, mutateMinistry, mutateSmallGroup, mutateVolunteer, promoteMcpGuest, removeMcpFamilyMember, runMcpBulk, updateMcpFamilyMemberRole } from "./mutations"
import { committeeRoleSchema, committeeSchema, mutateCommittee, mutateCommitteeRole, mutateEventOccurrence, mutateEventRegistrant, occurrenceSchema, registrantInputSchema, registrantUpdateSchema } from "./event-resources"
import { resolveMcpDGroupRequest, setMcpEventAttendance, setMcpOccurrenceCheckinOpen, targetMcpDGroupRequest } from "./operations"

const text = (payload: unknown) => ({
  structuredContent: payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : { result: payload },
  content: [{ type: "text" as const, text: JSON.stringify(payload) }],
})
const denied = (feature: string) => text({ error: `You do not have permission to access ${feature}.` })
const IMPORT_WIDGET_URI = "ui://churchie/dgroup-import-v1.html"

/** Creates a stateless MCP server for one authenticated Churchie actor. */
export function createChurchieMcpServer(actor: McpActor) {
  const server = new McpServer(
    { name: "churchie-admin", version: "0.2.0" },
    { instructions: "You manage Churchie Members, Guests, DGroups, Ministries, Events, Volunteers, and Families. Use search tools to find candidates, then a get tool to verify the exact record and current state before proposing a mutation. For people, use an exact phone or email match and never identify someone by name alone. Use life-stage and date filters instead of guessing. Summarize the intended change and its impact before invoking any approval-required tool. Deletes and bulk operations are Super Admin only." },
  )
  const approval = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  const destructive = { ...approval, destructiveHint: true }
  const readableEventIds = () => {
    if (!actorCan(actor, "Events", "Read")) return []
    return actor.role !== "SuperAdmin" && actor.eventAccess.size > 0 ? [...actor.eventAccess] : undefined
  }
  const widgetOrigin = process.env.CHURCHIE_MCP_URL?.replace(/\/$/, "") ?? ""
  const widgetHtml = `<!doctype html><html><body style="font:14px system-ui;padding:16px"><h2>DGroup workbook import</h2><p id="status">Preparing secure upload…</p><button id="open" hidden>Open Churchie upload</button><script>
let batchId=null;const status=document.getElementById('status');const button=document.getElementById('open');
function render(value){batchId=value?.batch?.id??value?.batchId??null;if(!batchId)return;status.textContent='The private import batch is ready.';button.hidden=false}
window.addEventListener('message',(event)=>{if(event.source!==window.parent)return;const message=event.data;if(message?.method==='ui/notifications/tool-result')render(message.params?.structuredContent)});
render(window.openai?.toolOutput);button.onclick=()=>{const href=${JSON.stringify(widgetOrigin)}+'/mcp/widget?batchId='+encodeURIComponent(batchId);if(window.openai?.openExternal)window.openai.openExternal({href});else window.open(href,'_blank','noopener,noreferrer')};
</script></body></html>`
  server.registerResource("dgroup-import-widget", IMPORT_WIDGET_URI, { mimeType: "text/html;profile=mcp-app" }, async () => ({ contents: [{ uri: IMPORT_WIDGET_URI, mimeType: "text/html;profile=mcp-app", text: widgetHtml, _meta: { ui: { prefersBorder: true } } }] }))

  // Each tool deliberately names a Churchie operation. There is no generic table
  // query or mutation endpoint for a model to broaden by prompt injection.
  const registerCrud = (key: string, title: string, feature: "Members" | "Guests" | "SmallGroups" | "Ministries" | "Events", schema: z.ZodType, mutate: (action: "create" | "update" | "delete", id?: string, data?: unknown) => Promise<unknown>) => {
    if (!actorCan(actor, feature, "Write")) return
    if (key !== "event" || actor.role === "SuperAdmin") server.registerTool(`create_${key}`, { title: `Create ${title}`, description: `Create one ${title}. Requires user approval.`, inputSchema: schema, annotations: approval }, async (data) => text(await mutate("create", undefined, data)))
    server.registerTool(`update_${key}`, { title: `Update ${title}`, description: `Update one ${title}. Requires user approval.`, inputSchema: z.object({ id: z.string(), data: schema }), annotations: approval }, async ({ id, data }) => text(await mutate("update", id, data)))
    if (actor.role === "SuperAdmin") server.registerTool(`delete_${key}`, { title: `Delete ${title}`, description: `Permanently delete one ${title}; relationship safeguards are enforced. Requires user approval.`, inputSchema: z.object({ id: z.string() }), annotations: destructive }, async ({ id }) => text(await mutate("delete", id)))
  }
  const bulkOperation = (schema: z.ZodType) => z.object({ operations: z.array(z.object({ action: z.enum(["create", "update", "delete"]), id: z.string().optional(), data: schema.optional() })).min(1).max(100) })

  registerCrud("member", "member", "Members", memberSchema, (action, id, data) => mutateMember(actor, action, id, data))
  registerCrud("guest", "guest", "Guests", guestSchema, (action, id, data) => mutateGuest(actor, action, id, data))
  registerCrud("dgroup", "DGroup", "SmallGroups", smallGroupSchema, (action, id, data) => mutateSmallGroup(actor, action, id, data))
  registerCrud("ministry", "ministry", "Ministries", ministrySchema, (action, id, data) => mutateMinistry(actor, action, id, data))
  registerCrud("event", "event", "Events", eventSchema, (action, id, data) => mutateEvent(actor, action, id, data))
  // Updates need the assignment/status fields that the create form intentionally omits.
  if (actorCan(actor, "Volunteers", "Write") && actorCan(actor, "Events", "Write")) {
    server.registerTool("create_volunteer", { title: "Create volunteer", description: "Create one event volunteer. Requires user approval.", inputSchema: createVolunteerSchema, annotations: approval }, async (data) => text(await mutateVolunteer(actor, "create", undefined, data)))
    server.registerTool("update_volunteer", { title: "Update volunteer", description: "Update one event volunteer. Requires user approval.", inputSchema: z.object({ id: z.string(), data: updateVolunteerSchema }), annotations: approval }, async ({ id, data }) => text(await mutateVolunteer(actor, "update", id, data)))
    if (actor.role === "SuperAdmin") server.registerTool("delete_volunteer", { title: "Delete volunteer", description: "Permanently delete one event volunteer. Requires user approval.", inputSchema: z.object({ id: z.string() }), annotations: destructive }, async ({ id }) => text(await mutateVolunteer(actor, "delete", id)))
  }
  if (actorCan(actor, "Members", "Write")) {
    server.registerTool("create_family", { title: "Create family", description: "Create one family. Requires user approval.", inputSchema: familySchema, annotations: approval }, async (data) => text(await mutateFamily(actor, "create", undefined, data)))
    server.registerTool("update_family", { title: "Update family", description: "Update one family. Requires user approval.", inputSchema: z.object({ id: z.string(), data: familySchema }), annotations: approval }, async ({ id, data }) => text(await mutateFamily(actor, "update", id, data)))
    if (actor.role === "SuperAdmin") server.registerTool("delete_family", { title: "Delete family", description: "Permanently delete one family. Requires user approval.", inputSchema: z.object({ id: z.string() }), annotations: destructive }, async ({ id }) => text(await mutateFamily(actor, "delete", id)))
  }

  if (actorCan(actor, "Events", "Write")) {
    server.registerTool("create_event_registrant", { title: "Create event registrant", description: "Register one member, guest, or explicitly identified anonymous person for an event.", inputSchema: registrantInputSchema, annotations: approval }, async (data) => text(await mutateEventRegistrant(actor, "create", undefined, data)))
    server.registerTool("update_event_registrant", { title: "Update event registrant", description: "Update attendance, nickname, or payment state for one event registrant.", inputSchema: z.object({ id: z.string(), data: registrantUpdateSchema }), annotations: approval }, async ({ id, data }) => text(await mutateEventRegistrant(actor, "update", id, data)))
    server.registerTool("create_event_occurrence", { title: "Create event session", description: "Create one session for a recurring or multi-day event.", inputSchema: occurrenceSchema, annotations: approval }, async (data) => text(await mutateEventOccurrence(actor, "create", undefined, data)))
    server.registerTool("update_event_occurrence", { title: "Update event session", description: "Update one event session.", inputSchema: z.object({ id: z.string(), data: occurrenceSchema }), annotations: approval }, async ({ id, data }) => text(await mutateEventOccurrence(actor, "update", id, data)))
    server.registerTool("set_event_attendance", { title: "Set event attendance", description: "Check in or undo check-in for one verified registrant or volunteer. Multi-day and recurring events require a session ID. Requires user approval.", inputSchema: z.object({ eventId: z.string(), subjectKind: z.enum(["registrant", "volunteer"]), subjectId: z.string(), occurrenceId: z.string().nullable().optional(), attended: z.boolean() }), annotations: { ...approval, idempotentHint: true } }, async (input) => text(await setMcpEventAttendance(actor, input)))
    server.registerTool("set_event_session_checkin", { title: "Open or close event session check-in", description: "Open or close check-in for one event session and keep the public walk-in target synchronized. Requires user approval.", inputSchema: z.object({ occurrenceId: z.string(), isOpen: z.boolean() }), annotations: { ...approval, idempotentHint: true } }, async ({ occurrenceId, isOpen }) => text(await setMcpOccurrenceCheckinOpen(actor, occurrenceId, isOpen)))
    server.registerTool("set_event_registrant_payment", { title: "Set event registrant payment", description: "Mark one verified registrant paid or unpaid. A payment reference is required when paid. Requires user approval.", inputSchema: z.object({ eventId: z.string(), registrantId: z.string(), isPaid: z.boolean(), paymentReference: z.string().trim().max(255).nullable().optional() }).superRefine((value, ctx) => { if (value.isPaid && !value.paymentReference) ctx.addIssue({ code: "custom", message: "A payment reference is required when marking a registration paid." }) }), annotations: { ...approval, idempotentHint: true } }, async ({ eventId, registrantId, isPaid, paymentReference }) => text(await mutateEventRegistrant(actor, "update", registrantId, { eventId, isPaid, paymentReference: isPaid ? paymentReference : null })))
    if (actor.role === "SuperAdmin") {
      server.registerTool("delete_event_registrant", { title: "Delete event registrant", description: "Permanently remove one registrant from an event. Super Admin only.", inputSchema: z.object({ id: z.string(), eventId: z.string() }), annotations: destructive }, async ({ id, eventId }) => text(await mutateEventRegistrant(actor, "delete", id, { eventId })))
      server.registerTool("delete_event_occurrence", { title: "Delete event session", description: "Permanently delete a recurring event session. Super Admin only.", inputSchema: z.object({ id: z.string(), eventId: z.string() }), annotations: destructive }, async ({ id, eventId }) => text(await mutateEventOccurrence(actor, "delete", id, { eventId })))
    }
  }

  if (actorCan(actor, "Events", "Write") && actorCan(actor, "Volunteers", "Write")) {
    server.registerTool("create_event_committee", { title: "Create event committee", description: "Create one volunteer committee for an event.", inputSchema: committeeSchema, annotations: approval }, async (data) => text(await mutateCommittee(actor, "create", undefined, data)))
    server.registerTool("update_event_committee", { title: "Update event committee", description: "Rename one event volunteer committee.", inputSchema: z.object({ id: z.string(), data: committeeSchema }), annotations: approval }, async ({ id, data }) => text(await mutateCommittee(actor, "update", id, data)))
    server.registerTool("create_committee_role", { title: "Create committee role", description: "Create one role inside an event committee.", inputSchema: committeeRoleSchema, annotations: approval }, async (data) => text(await mutateCommitteeRole(actor, "create", undefined, data)))
    server.registerTool("update_committee_role", { title: "Update committee role", description: "Rename one role inside an event committee.", inputSchema: z.object({ id: z.string(), data: committeeRoleSchema }), annotations: approval }, async ({ id, data }) => text(await mutateCommitteeRole(actor, "update", id, data)))
    if (actor.role === "SuperAdmin") {
      server.registerTool("delete_event_committee", { title: "Delete event committee", description: "Permanently delete an event committee when no relationships block it. Super Admin only.", inputSchema: z.object({ id: z.string(), eventId: z.string() }), annotations: destructive }, async ({ id, eventId }) => text(await mutateCommittee(actor, "delete", id, { eventId })))
      server.registerTool("delete_committee_role", { title: "Delete committee role", description: "Permanently delete a committee role when no volunteers depend on it. Super Admin only.", inputSchema: z.object({ id: z.string(), eventId: z.string(), committeeId: z.string() }), annotations: destructive }, async ({ id, eventId, committeeId }) => text(await mutateCommitteeRole(actor, "delete", id, { eventId, committeeId })))
    }
  }

  if (actorCan(actor, "Members", "Write")) {
    server.registerTool("add_family_member", { title: "Add family member", description: "Add a member or unpromoted guest to a family. Requires user approval.", inputSchema: z.object({ familyId: z.string(), member: familyMemberSchema }), annotations: approval }, async ({ familyId, member }) => text(await addMcpFamilyMember(actor, familyId, member)))
    server.registerTool("update_family_member_role", { title: "Update family member role", description: "Change one person's role in a family. Requires user approval.", inputSchema: z.object({ familyMemberId: z.string(), role: familyMemberSchema.shape.role }), annotations: approval }, async ({ familyMemberId, role }) => text(await updateMcpFamilyMemberRole(actor, familyMemberId, role)))
    if (actor.role === "SuperAdmin") server.registerTool("remove_family_member", { title: "Remove family member", description: "Permanently remove one family membership. Super Admin only. Requires user approval.", inputSchema: z.object({ familyMemberId: z.string() }), annotations: destructive }, async ({ familyMemberId }) => text(await removeMcpFamilyMember(actor, familyMemberId)))
  }
  if (actorCan(actor, "Guests", "Write") && actorCan(actor, "Members", "Write")) server.registerTool("promote_guest_to_member", { title: "Promote guest to member", description: "Promote one guest, retaining their history and optionally placing the new member in a DGroup. Requires user approval.", inputSchema: z.object({ guestId: z.string(), dateJoined: z.string().min(1), groupId: z.string().nullable().optional() }), annotations: approval }, async (input) => text(await promoteMcpGuest(actor, input.guestId, input)))
  if (actorCan(actor, "SmallGroups", "Write") && actorCan(actor, "Members", "Write")) server.registerTool("move_dgroup_member", { title: "Move DGroup member", description: "Assign, transfer, or remove a member from a DGroup and set their roster status. Requires user approval.", inputSchema: z.object({ memberId: z.string(), groupId: z.string().nullable(), status: z.enum(["Member", "Timothy", "Leader"]).nullable() }), annotations: approval }, async (input) => text(await moveMcpDGroupMember(actor, input.memberId, input.groupId, input.status)))
  if (actorCan(actor, "SmallGroups", "Write")) {
    server.registerTool("resolve_dgroup_request", { title: "Resolve DGroup request", description: "Approve or deny one group-targeted pending request using Churchie's promotion, transfer, capacity, and audit rules. Requires user approval.", inputSchema: z.object({ requestId: z.string(), decision: z.enum(["approve", "deny"]), notes: z.string().max(2000).nullable().optional() }), annotations: approval }, async ({ requestId, decision, notes }) => text(await resolveMcpDGroupRequest(actor, requestId, decision, notes)))
    server.registerTool("target_dgroup_request", { title: "Target DGroup request", description: "Assign an unplaced registration-intent request to a verified DGroup, leaving it pending confirmation. Requires user approval.", inputSchema: z.object({ requestId: z.string(), groupId: z.string() }), annotations: approval }, async ({ requestId, groupId }) => text(await targetMcpDGroupRequest(actor, requestId, groupId)))
  }

  const bulk = (key: string, title: string, feature: "Members" | "Guests" | "SmallGroups" | "Ministries" | "Events" | "Volunteers" | "Families", schema: z.ZodType) => {
    const permissionFeature = feature === "Families" ? "Members" : feature
    if (actor.role !== "SuperAdmin" || !actorCan(actor, permissionFeature, "Write")) return
    if (feature === "Volunteers" && !actorCan(actor, "Events", "Write")) return
    server.registerTool(`bulk_${key}`, { title: `Bulk manage ${title}`, description: `Super Admin only. Create, update, or permanently delete up to 100 ${title}; each result is returned separately. Requires user approval.`, inputSchema: bulkOperation(schema), annotations: destructive }, async ({ operations }) => text(await runMcpBulk(actor, feature, operations)))
  }
  bulk("members", "members", "Members", memberSchema)
  bulk("guests", "guests", "Guests", guestSchema)
  bulk("dgroups", "DGroups", "SmallGroups", smallGroupSchema)
  bulk("ministries", "ministries", "Ministries", ministrySchema)
  bulk("events", "events", "Events", eventSchema)
  bulk("volunteers", "volunteers", "Volunteers", updateVolunteerSchema)
  bulk("families", "families", "Families", familySchema)

  server.registerTool("list_life_stages", {
    title: "List life stages",
    description: "List configured Churchie life stages and IDs for filtering and validated mutations.",
    inputSchema: z.object({}), annotations: { readOnlyHint: true },
  }, async () => {
    const permitted = actorCan(actor, "Members", "Read") || actorCan(actor, "Guests", "Read") || actorCan(actor, "SmallGroups", "Read") || actorCan(actor, "Ministries", "Read")
    return permitted ? text(await listLifeStages()) : denied("life stages")
  })

  server.registerTool("search_members", {
    title: "Search members", description: "Search members by name, email, or Philippine mobile number.",
    inputSchema: z.object({ query: z.string().optional(), lifeStageId: z.string().optional(), gender: z.enum(["Male", "Female"]).optional(), inSmallGroup: z.boolean().optional(), limit: z.number().int().min(1).max(50).optional() }),
    annotations: { readOnlyHint: true },
  }, async (input) => {
    if (!actorCan(actor, "Members", "Read")) return denied("Members")
    if (input.inSmallGroup !== undefined && !actorCan(actor, "SmallGroups", "Read")) return denied("DGroups")
    return text(await queryMembers({ ...input, includeDGroups: actorCan(actor, "SmallGroups", "Read") }))
  })

  server.registerTool("get_member", {
    title: "Get member details", description: "Return one verified member's contact details, DGroup relationships, matching profile, and recent events.",
    inputSchema: z.object({ memberId: z.string() }), annotations: { readOnlyHint: true },
  }, async ({ memberId }) => {
    if (!actorCan(actor, "Members", "Read")) return denied("Members")
    return text((await getMemberDetail(memberId, readableEventIds(), actorCan(actor, "SmallGroups", "Read"))) ?? { error: "Member not found." })
  })

  server.registerTool("search_guests", {
    title: "Search guests", description: "Search active or promoted guests by name, email, or mobile number.",
    inputSchema: z.object({ query: z.string().optional(), lifeStageId: z.string().optional(), status: z.enum(["active", "promoted", "all"]).optional(), limit: z.number().int().min(1).max(50).optional() }),
    annotations: { readOnlyHint: true },
  }, async (input) => {
    if (!actorCan(actor, "Guests", "Read")) return denied("Guests")
    return text(await queryGuests({ ...input, includeDGroups: actorCan(actor, "SmallGroups", "Read") }))
  })

  server.registerTool("get_guest", {
    title: "Get guest details", description: "Return one verified guest's contact details, matching profile, DGroup requests, and recent events.",
    inputSchema: z.object({ guestId: z.string() }), annotations: { readOnlyHint: true },
  }, async ({ guestId }) => {
    if (!actorCan(actor, "Guests", "Read")) return denied("Guests")
    return text((await getGuestDetail(guestId, readableEventIds(), actorCan(actor, "SmallGroups", "Read"))) ?? { error: "Guest not found." })
  })

  server.registerTool("check_duplicate_contact", {
    title: "Check duplicate contact",
    description: "Check exact normalized phone or case-insensitive email ownership before creating or updating a person.",
    inputSchema: z.object({ phone: z.string().optional(), email: z.string().email().optional() }).refine((value) => Boolean(value.phone || value.email), { message: "Provide a phone or email." }),
    annotations: { readOnlyHint: true },
  }, async ({ phone, email }) => {
    if (!actorCan(actor, "Members", "Read") || !actorCan(actor, "Guests", "Read")) return denied("Members and Guests")
    return text(await checkDuplicateContactInfo({ phone: phone ? formatPhilippinePhone(phone) : undefined, email }))
  })

  server.registerTool("search_dgroups", {
    title: "Search DGroups", description: "Search DGroups by name or leader. Day is 0 (Sunday) through 6 (Saturday).",
    inputSchema: z.object({ query: z.string().optional(), lifeStageId: z.string().optional(), dayOfWeek: z.number().int().min(0).max(6).optional(), groupType: z.enum(["Regular", "Couples"]).optional(), status: z.enum(["Active", "Pending", "Inactive"]).optional(), genderFocus: z.enum(["Male", "Female", "Mixed"]).optional(), meetingFormat: z.enum(["Online", "Hybrid", "InPerson"]).optional(), locationCity: z.string().optional(), limit: z.number().int().min(1).max(50).optional() }),
    annotations: { readOnlyHint: true },
  }, async (input) => {
    if (!actorCan(actor, "SmallGroups", "Read")) return denied("DGroups")
    return text(await querySmallGroups(input))
  })

  server.registerTool("get_dgroup_stats", {
    title: "Get DGroup statistics",
    description: "Return DGroup counts by status, total and average roster size, capacity pressure, incomplete schedules, and pending requests.",
    inputSchema: z.object({}), annotations: { readOnlyHint: true },
  }, async () => {
    if (!actorCan(actor, "SmallGroups", "Read")) return denied("DGroups")
    return text(await getSmallGroupStats())
  })

  server.registerTool("get_dgroup", {
    title: "Get DGroup details", description: "Return one DGroup's leader, schedule, roster, and requests.",
    inputSchema: z.object({ groupId: z.string() }), annotations: { readOnlyHint: true },
  }, async ({ groupId }) => {
    if (!actorCan(actor, "SmallGroups", "Read")) return denied("DGroups")
    return text((await getSmallGroupDetail(groupId)) ?? { error: "DGroup not found." })
  })

  server.registerTool("match_dgroups", {
    title: "Match compatible DGroups",
    description: "Rank compatible DGroups for one already-resolved guest or member using Churchie's matching engine.",
    inputSchema: z.object({ guestId: z.string().optional(), memberId: z.string().optional(), limit: z.number().int().min(1).max(10).optional() }).refine((value) => Boolean(value.guestId) !== Boolean(value.memberId), { message: "Provide exactly one guestId or memberId." }),
    annotations: { readOnlyHint: true },
  }, async ({ guestId, memberId, limit }) => {
    if (!actorCan(actor, "SmallGroups", "Read")) return denied("DGroups")
    if (guestId && !actorCan(actor, "Guests", "Read")) return denied("Guests")
    if (memberId && !actorCan(actor, "Members", "Read")) return denied("Members")
    const matches = await matchSmallGroups(guestId ? { guestId } : { memberId: memberId! }, { limit: limit ?? 5 })
    return text({ matches: matches.map(toAssistantMatchRow) })
  })

  server.registerTool("search_dgroup_requests", {
    title: "Search DGroup requests",
    description: "List pending or historical DGroup assignment, transfer, and registration-intent requests.",
    inputSchema: z.object({ status: z.enum(["Pending", "Confirmed", "Rejected"]).optional(), origin: z.enum(["Assignment", "RegistrationIntent"]).optional(), groupId: z.string().optional(), sourceEventId: z.string().optional(), limit: z.number().int().min(1).max(50).optional() }),
    annotations: { readOnlyHint: true },
  }, async (input) => {
    if (!actorCan(actor, "SmallGroups", "Read")) return denied("DGroups")
    if (input.sourceEventId && !actorCanAccessEvent(actor, input.sourceEventId)) return denied("this event")
    const allowedSourceEventIds = readableEventIds()
    return text(await querySmallGroupRequests({ ...input, allowedSourceEventIds }))
  })

  server.registerTool("search_events", {
    title: "Search events", description: "Search events by name, type, ministry, timeframe, or an overlapping date range.",
    inputSchema: z.object({ query: z.string().optional(), timeframe: z.enum(["upcoming", "past", "all"]).optional(), type: z.enum(["OneTime", "MultiDay", "Recurring"]).optional(), ministryId: z.string().optional(), startDateFrom: z.string().date().optional(), startDateTo: z.string().date().optional(), limit: z.number().int().min(1).max(50).optional() }), annotations: { readOnlyHint: true },
  }, async (input) => {
    if (!actorCan(actor, "Events", "Read")) return denied("Events")
    const result = await queryEvents({ ...input, startDateFrom: input.startDateFrom ? new Date(`${input.startDateFrom}T00:00:00.000Z`) : undefined, startDateTo: input.startDateTo ? new Date(`${input.startDateTo}T23:59:59.999Z`) : undefined, eventIds: actor.role !== "SuperAdmin" && actor.eventAccess.size > 0 ? [...actor.eventAccess] : undefined })
    return text(result)
  })

  server.registerTool("search_volunteers", {
    title: "Search volunteers", description: "Search event and ministry volunteers.",
    inputSchema: z.object({ eventId: z.string().optional(), query: z.string().optional(), status: z.enum(["Pending", "Confirmed", "Rejected"]).optional(), limit: z.number().int().min(1).max(50).optional() }), annotations: { readOnlyHint: true },
  }, async (input) => {
    if (!actorCan(actor, "Volunteers", "Read")) return denied("Volunteers")
    if (!actorCan(actor, "Events", "Read")) return denied("Events")
    if (actor.role !== "SuperAdmin" && actor.eventAccess.size > 0) {
      if (!input.eventId) return text({ error: "Choose an event before searching volunteers." })
      if (!actorCanAccessEvent(actor, input.eventId)) return denied("this event")
    }
    return text(await queryVolunteers(input))
  })

  server.registerTool("get_volunteer", {
    title: "Get volunteer details", description: "Return one volunteer's member, event, committee, role, approval, and attendance details.",
    inputSchema: z.object({ volunteerId: z.string() }), annotations: { readOnlyHint: true },
  }, async ({ volunteerId }) => {
    if (!actorCan(actor, "Volunteers", "Read")) return denied("Volunteers")
    const ref = await db.volunteer.findUnique({ where: { id: volunteerId }, select: { eventId: true } })
    if (!ref) return text({ error: "Volunteer not found." })
    if (!actorCanAccessEvent(actor, ref.eventId)) return denied("this event")
    return text((await getVolunteerDetail(volunteerId)) ?? { error: "Volunteer not found." })
  })

  server.registerTool("search_ministries", {
    title: "Search ministries", description: "Search ministries before managing events or ministry details.",
    inputSchema: z.object({ query: z.string().optional(), limit: z.number().int().min(1).max(50).optional() }), annotations: { readOnlyHint: true },
  }, async (input) => {
    if (!actorCan(actor, "Ministries", "Read")) return denied("Ministries")
    return text(await queryMinistries(input))
  })

  server.registerTool("get_ministry", {
    title: "Get ministry details", description: "Return one ministry's life stage, branding, and linked event history.",
    inputSchema: z.object({ ministryId: z.string() }), annotations: { readOnlyHint: true },
  }, async ({ ministryId }) => {
    if (!actorCan(actor, "Ministries", "Read")) return denied("Ministries")
    return text((await getMinistryDetail(ministryId, readableEventIds())) ?? { error: "Ministry not found." })
  })

  server.registerTool("get_event", {
    title: "Get event details", description: "Get an event and its scoped related records before changing it.",
    inputSchema: z.object({ eventId: z.string() }), annotations: { readOnlyHint: true },
  }, async ({ eventId }) => {
    if (!actorCanAccessEvent(actor, eventId)) return denied("this event")
    return text((await getEventDetail(eventId)) ?? { error: "Event not found." })
  })

  server.registerTool("get_event_attendance_stats", {
    title: "Get event attendance statistics", description: "Return one-time totals or chronological per-session attendance for an event.",
    inputSchema: z.object({ eventId: z.string() }), annotations: { readOnlyHint: true },
  }, async ({ eventId }) => {
    if (!actorCanAccessEvent(actor, eventId)) return denied("this event")
    return text((await getEventAttendanceStats(eventId)) ?? { error: "Event not found." })
  })

  server.registerTool("list_event_sessions", {
    title: "List event sessions", description: "List session IDs, dates, open state, notes, series, and attendance counts for an event.",
    inputSchema: z.object({ eventId: z.string(), limit: z.number().int().min(1).max(50).optional() }), annotations: { readOnlyHint: true },
  }, async ({ eventId, limit }) => {
    if (!actorCanAccessEvent(actor, eventId)) return denied("this event")
    return text(await listEventOccurrences(eventId, limit))
  })

  server.registerTool("search_event_registrants", {
    title: "Search event registrants", description: "Search registrants for one event.",
    inputSchema: z.object({ eventId: z.string(), query: z.string().optional(), isPaid: z.boolean().optional(), attended: z.boolean().optional(), limit: z.number().int().min(1).max(50).optional() }), annotations: { readOnlyHint: true },
  }, async (input) => {
    if (!actorCanAccessEvent(actor, input.eventId)) return denied("this event")
    return text(await queryEventRegistrants(input))
  })

  server.registerTool("search_families", {
    title: "Search families", description: "Search families by household name.",
    inputSchema: z.object({ query: z.string().optional(), limit: z.number().int().min(1).max(50).optional() }), annotations: { readOnlyHint: true },
  }, async ({ query, limit = 20 }) => {
    if (!actorCan(actor, "Members", "Read")) return denied("Families")
    const where = query ? { name: { contains: query.trim(), mode: "insensitive" as const } } : {}
    const [rows, totalCount] = await Promise.all([
      db.family.findMany({ where, orderBy: { name: "asc" }, take: limit, select: { id: true, name: true, notes: true, _count: { select: { members: true } } } }),
      db.family.count({ where }),
    ])
    return text({ rows: rows.map(({ _count, ...family }) => ({ ...family, memberCount: _count.members })), totalCount, truncated: totalCount > rows.length })
  })

  server.registerTool("get_family", {
    title: "Get family details", description: "Return one family's notes and complete member/guest household roles.",
    inputSchema: z.object({ familyId: z.string() }), annotations: { readOnlyHint: true },
  }, async ({ familyId }) => {
    if (!actorCan(actor, "Members", "Read")) return denied("Families")
    return text((await getFamilyDetail(familyId)) ?? { error: "Family not found." })
  })

  server.registerTool("get_entity_counts", {
    title: "Get Churchie overview counts", description: "Return permission-scoped counts for members, active guests, DGroups, ministries, upcoming events, volunteers, and families.",
    inputSchema: z.object({}), annotations: { readOnlyHint: true },
  }, async () => {
    const eventIds = readableEventIds()
    return text(await getEntityCounts({
      members: actorCan(actor, "Members", "Read"),
      guests: actorCan(actor, "Guests", "Read"),
      smallGroups: actorCan(actor, "SmallGroups", "Read"),
      ministries: actorCan(actor, "Ministries", "Read"),
      events: actorCan(actor, "Events", "Read"),
      volunteers: actorCan(actor, "Volunteers", "Read"),
      families: actorCan(actor, "Members", "Read"),
      eventIds,
    }))
  })

  server.registerTool("update_dgroup_schedule", {
    title: "Update DGroup schedule", description: "Update the meeting day and time for an existing DGroup. Requires user approval.",
    inputSchema: z.object({ groupId: z.string(), dayOfWeek: z.number().int().min(0).max(6).nullable(), timeStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(), timeEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable() }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (input) => {
    if (!actorCan(actor, "SmallGroups", "Write")) return denied("DGroups")
    if ((input.timeStart === null) !== (input.timeEnd === null)) return text({ error: "Provide both meeting times, or clear both." })
    const group = await db.smallGroup.update({ where: { id: input.groupId }, data: { scheduleDayOfWeek: input.dayOfWeek, scheduleTimeStart: input.timeStart, scheduleTimeEnd: input.timeEnd }, select: { id: true, name: true, scheduleDayOfWeek: true, scheduleTimeStart: true, scheduleTimeEnd: true } }).catch(() => null)
    if (!group) return text({ error: "DGroup not found." })
    await db.smallGroupLog.create({ data: { smallGroupId: group.id, action: "GroupUpdated", performedByUserId: actor.id, description: "Schedule updated through the Churchie ChatGPT plugin" } }).catch(() => undefined)
    return text({ success: true, group })
  })

  server.registerTool("start_dgroup_workbook_import", {
    title: "Start DGroup workbook import", description: "Create a private staged import batch. Upload the workbook through the Churchie widget URL returned by this tool.",
    inputSchema: z.object({ fileName: z.string().min(1).max(255) }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri: IMPORT_WIDGET_URI }, "openai/outputTemplate": IMPORT_WIDGET_URI },
  }, async ({ fileName }) => {
    if (!actorCan(actor, "SmallGroups", "Import")) return denied("DGroup imports")
    const batch = await db.dGroupImportBatch.create({ data: { userId: actor.id, fileName, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }, select: { id: true, status: true, expiresAt: true } })
    return text({ success: true, batch, widgetPath: `/mcp/widget?batchId=${batch.id}`, uploadPath: `/api/mcp/imports/${batch.id}/upload`, nextStep: "Upload the workbook in the Churchie widget, then ask me to inspect the staged batch." })
  })

  server.registerTool("get_dgroup_import_batch", {
    title: "Inspect DGroup import batch", description: "Inspect detected workbook tables, column decisions, and proposed changes.",
    inputSchema: z.object({ batchId: z.string() }), annotations: { readOnlyHint: true },
  }, async ({ batchId }) => {
    if (!actorCan(actor, "SmallGroups", "Import")) return denied("DGroup imports")
    const batch = await db.dGroupImportBatch.findFirst({ where: { id: batchId, userId: actor.id }, include: { changes: { orderBy: [{ sourceSheet: "asc" }, { sourceRow: "asc" }], take: 100 } } })
    return text(batch ?? { error: "Import batch not found." })
  })

  server.registerTool("apply_safe_dgroup_import", {
    title: "Apply safe DGroup workbook changes", description: "Apply only exact contact-matched DGroup schedule updates from a staged batch. Requires user approval.",
    inputSchema: z.object({ batchId: z.string() }), annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async ({ batchId }) => {
    if (!actorCan(actor, "SmallGroups", "Import") || !actorCan(actor, "SmallGroups", "Write")) return denied("DGroup imports")
    return text(await applySafeDGroupImport(batchId, actor.id))
  })

  server.registerTool("confirm_dgroup_import_review", {
    title: "Confirm DGroup import review",
    description: "Record the administrator's column classifications and move a parsed workbook to final review. This does not change Churchie records.",
    inputSchema: z.object({
      batchId: z.string(),
      columnDecisions: z.record(z.string(), z.enum(["churchie", "review_only", "external"])),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ batchId, columnDecisions }) => {
    if (!actorCan(actor, "SmallGroups", "Import")) return denied("DGroup imports")
    return text(await confirmDGroupImportReview(batchId, actor.id, columnDecisions))
  })

  server.registerTool("undo_safe_dgroup_import", {
    title: "Undo safe DGroup workbook changes", description: "Undo a completed safe DGroup import within seven days. Conflicting later edits are left untouched.",
    inputSchema: z.object({ batchId: z.string() }), annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ batchId }) => {
    if (!actorCan(actor, "SmallGroups", "Import") || !actorCan(actor, "SmallGroups", "Write")) return denied("DGroup imports")
    return text(await undoSafeDGroupImport(batchId, actor.id))
  })

  return server
}

export function normalizeMcpPhone(phone: string) {
  return formatPhilippinePhone(phone)
}
