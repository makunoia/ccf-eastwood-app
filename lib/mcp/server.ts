import "server-only"

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { db } from "@/lib/db"
import { formatPhilippinePhone } from "@/lib/utils"
import { queryGuests, queryMembers, querySmallGroups, getSmallGroupDetail, queryEvents, queryVolunteers, queryMinistries, queryEventRegistrants, getEventDetail } from "@/lib/assistant/queries"
import { toAssistantList } from "@/lib/assistant/serializers"
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

const text = (payload: unknown) => ({
  structuredContent: payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : { result: payload },
  content: [{ type: "text" as const, text: JSON.stringify(payload) }],
})
const denied = (feature: string) => text({ error: `You do not have permission to access ${feature}.` })
const IMPORT_WIDGET_URI = "ui://churchie/dgroup-import-v1.html"

/** Creates a stateless MCP server for one authenticated Churchie actor. */
export function createChurchieMcpServer(actor: McpActor) {
  const server = new McpServer(
    { name: "churchie-admin", version: "0.1.0" },
    { instructions: "Resolve records with a search/get tool before changing them. Never infer a person from name alone. Explain changes before invoking write tools; deletes and bulk operations are Super Admin only." },
  )
  const approval = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  const destructive = { ...approval, destructiveHint: true }
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
  const registerCrud = (key: string, title: string, schema: z.ZodType, mutate: (action: "create" | "update" | "delete", id?: string, data?: unknown) => Promise<unknown>) => {
    server.registerTool(`create_${key}`, { title: `Create ${title}`, description: `Create one ${title}. Requires user approval.`, inputSchema: schema, annotations: approval }, async (data) => text(await mutate("create", undefined, data)))
    server.registerTool(`update_${key}`, { title: `Update ${title}`, description: `Update one ${title}. Requires user approval.`, inputSchema: z.object({ id: z.string(), data: schema }), annotations: approval }, async ({ id, data }) => text(await mutate("update", id, data)))
    server.registerTool(`delete_${key}`, { title: `Delete ${title}`, description: `Permanently delete one ${title}; relationship safeguards are enforced. Requires user approval.`, inputSchema: z.object({ id: z.string() }), annotations: destructive }, async ({ id }) => text(await mutate("delete", id)))
  }
  const bulkOperation = (schema: z.ZodType) => z.object({ operations: z.array(z.object({ action: z.enum(["create", "update", "delete"]), id: z.string().optional(), data: schema.optional() })).min(1).max(100) })

  registerCrud("member", "member", memberSchema, (action, id, data) => mutateMember(actor, action, id, data))
  registerCrud("guest", "guest", guestSchema, (action, id, data) => mutateGuest(actor, action, id, data))
  registerCrud("dgroup", "DGroup", smallGroupSchema, (action, id, data) => mutateSmallGroup(actor, action, id, data))
  registerCrud("ministry", "ministry", ministrySchema, (action, id, data) => mutateMinistry(actor, action, id, data))
  registerCrud("event", "event", eventSchema, (action, id, data) => mutateEvent(actor, action, id, data))
  // Updates need the assignment/status fields that the create form intentionally omits.
  server.registerTool("create_volunteer", { title: "Create volunteer", description: "Create one event volunteer. Requires user approval.", inputSchema: createVolunteerSchema, annotations: approval }, async (data) => text(await mutateVolunteer(actor, "create", undefined, data)))
  server.registerTool("update_volunteer", { title: "Update volunteer", description: "Update one event volunteer. Requires user approval.", inputSchema: z.object({ id: z.string(), data: updateVolunteerSchema }), annotations: approval }, async ({ id, data }) => text(await mutateVolunteer(actor, "update", id, data)))
  server.registerTool("delete_volunteer", { title: "Delete volunteer", description: "Permanently delete one event volunteer. Requires user approval.", inputSchema: z.object({ id: z.string() }), annotations: destructive }, async ({ id }) => text(await mutateVolunteer(actor, "delete", id)))
  registerCrud("family", "family", familySchema, (action, id, data) => mutateFamily(actor, action, id, data))

  server.registerTool("create_event_registrant", { title: "Create event registrant", description: "Register one member, guest, or explicitly identified anonymous person for an event.", inputSchema: registrantInputSchema, annotations: approval }, async (data) => text(await mutateEventRegistrant(actor, "create", undefined, data)))
  server.registerTool("update_event_registrant", { title: "Update event registrant", description: "Update attendance, nickname, or payment state for one event registrant.", inputSchema: z.object({ id: z.string(), data: registrantUpdateSchema }), annotations: approval }, async ({ id, data }) => text(await mutateEventRegistrant(actor, "update", id, data)))
  server.registerTool("delete_event_registrant", { title: "Delete event registrant", description: "Permanently remove one registrant from an event. Super Admin only.", inputSchema: z.object({ id: z.string(), eventId: z.string() }), annotations: destructive }, async ({ id, eventId }) => text(await mutateEventRegistrant(actor, "delete", id, { eventId })))

  server.registerTool("create_event_occurrence", { title: "Create event session", description: "Create one session for a recurring or multi-day event.", inputSchema: occurrenceSchema, annotations: approval }, async (data) => text(await mutateEventOccurrence(actor, "create", undefined, data)))
  server.registerTool("update_event_occurrence", { title: "Update event session", description: "Update one event session.", inputSchema: z.object({ id: z.string(), data: occurrenceSchema }), annotations: approval }, async ({ id, data }) => text(await mutateEventOccurrence(actor, "update", id, data)))
  server.registerTool("delete_event_occurrence", { title: "Delete event session", description: "Permanently delete a recurring event session. Super Admin only.", inputSchema: z.object({ id: z.string(), eventId: z.string() }), annotations: destructive }, async ({ id, eventId }) => text(await mutateEventOccurrence(actor, "delete", id, { eventId })))

  server.registerTool("create_event_committee", { title: "Create event committee", description: "Create one volunteer committee for an event.", inputSchema: committeeSchema, annotations: approval }, async (data) => text(await mutateCommittee(actor, "create", undefined, data)))
  server.registerTool("update_event_committee", { title: "Update event committee", description: "Rename one event volunteer committee.", inputSchema: z.object({ id: z.string(), data: committeeSchema }), annotations: approval }, async ({ id, data }) => text(await mutateCommittee(actor, "update", id, data)))
  server.registerTool("delete_event_committee", { title: "Delete event committee", description: "Permanently delete an event committee when no relationships block it. Super Admin only.", inputSchema: z.object({ id: z.string(), eventId: z.string() }), annotations: destructive }, async ({ id, eventId }) => text(await mutateCommittee(actor, "delete", id, { eventId })))

  server.registerTool("create_committee_role", { title: "Create committee role", description: "Create one role inside an event committee.", inputSchema: committeeRoleSchema, annotations: approval }, async (data) => text(await mutateCommitteeRole(actor, "create", undefined, data)))
  server.registerTool("update_committee_role", { title: "Update committee role", description: "Rename one role inside an event committee.", inputSchema: z.object({ id: z.string(), data: committeeRoleSchema }), annotations: approval }, async ({ id, data }) => text(await mutateCommitteeRole(actor, "update", id, data)))
  server.registerTool("delete_committee_role", { title: "Delete committee role", description: "Permanently delete a committee role when no volunteers depend on it. Super Admin only.", inputSchema: z.object({ id: z.string(), eventId: z.string(), committeeId: z.string() }), annotations: destructive }, async ({ id, eventId, committeeId }) => text(await mutateCommitteeRole(actor, "delete", id, { eventId, committeeId })))

  server.registerTool("add_family_member", { title: "Add family member", description: "Add a member or unpromoted guest to a family. Requires user approval.", inputSchema: z.object({ familyId: z.string(), member: familyMemberSchema }), annotations: approval }, async ({ familyId, member }) => text(await addMcpFamilyMember(actor, familyId, member)))
  server.registerTool("update_family_member_role", { title: "Update family member role", description: "Change one person's role in a family. Requires user approval.", inputSchema: z.object({ familyMemberId: z.string(), role: familyMemberSchema.shape.role }), annotations: approval }, async ({ familyMemberId, role }) => text(await updateMcpFamilyMemberRole(actor, familyMemberId, role)))
  server.registerTool("remove_family_member", { title: "Remove family member", description: "Permanently remove one family membership. Super Admin only. Requires user approval.", inputSchema: z.object({ familyMemberId: z.string() }), annotations: destructive }, async ({ familyMemberId }) => text(await removeMcpFamilyMember(actor, familyMemberId)))
  server.registerTool("promote_guest_to_member", { title: "Promote guest to member", description: "Promote one guest, retaining their history and optionally placing the new member in a DGroup. Requires user approval.", inputSchema: z.object({ guestId: z.string(), dateJoined: z.string().min(1), groupId: z.string().nullable().optional() }), annotations: approval }, async (input) => text(await promoteMcpGuest(actor, input.guestId, input)))
  server.registerTool("move_dgroup_member", { title: "Move DGroup member", description: "Assign, transfer, or remove a member from a DGroup and set their roster status. Requires user approval.", inputSchema: z.object({ memberId: z.string(), groupId: z.string().nullable(), status: z.enum(["Member", "Timothy", "Leader"]).nullable() }), annotations: approval }, async (input) => text(await moveMcpDGroupMember(actor, input.memberId, input.groupId, input.status)))

  const bulk = (key: string, title: string, feature: "Members" | "Guests" | "SmallGroups" | "Ministries" | "Events" | "Volunteers" | "Families", schema: z.ZodType) => server.registerTool(`bulk_${key}`, { title: `Bulk manage ${title}`, description: `Super Admin only. Create, update, or permanently delete up to 100 ${title}; each result is returned separately. Requires user approval.`, inputSchema: bulkOperation(schema), annotations: destructive }, async ({ operations }) => text(await runMcpBulk(actor, feature, operations)))
  bulk("members", "members", "Members", memberSchema)
  bulk("guests", "guests", "Guests", guestSchema)
  bulk("dgroups", "DGroups", "SmallGroups", smallGroupSchema)
  bulk("ministries", "ministries", "Ministries", ministrySchema)
  bulk("events", "events", "Events", eventSchema)
  bulk("volunteers", "volunteers", "Volunteers", updateVolunteerSchema)
  bulk("families", "families", "Families", familySchema)

  server.registerTool("search_members", {
    title: "Search members", description: "Search members by name, email, or Philippine mobile number.",
    inputSchema: z.object({ query: z.string().optional(), limit: z.number().int().min(1).max(50).optional() }),
    annotations: { readOnlyHint: true },
  }, async ({ query, limit }) => {
    if (!actorCan(actor, "Members", "Read")) return denied("Members")
    return text(await queryMembers({ query, limit }))
  })

  server.registerTool("search_guests", {
    title: "Search guests", description: "Search active or promoted guests by name, email, or mobile number.",
    inputSchema: z.object({ query: z.string().optional(), status: z.enum(["active", "promoted", "all"]).optional(), limit: z.number().int().min(1).max(50).optional() }),
    annotations: { readOnlyHint: true },
  }, async (input) => {
    if (!actorCan(actor, "Guests", "Read")) return denied("Guests")
    return text(await queryGuests(input))
  })

  server.registerTool("search_dgroups", {
    title: "Search DGroups", description: "Search DGroups by name or leader. Day is 0 (Sunday) through 6 (Saturday).",
    inputSchema: z.object({ query: z.string().optional(), dayOfWeek: z.number().int().min(0).max(6).optional(), limit: z.number().int().min(1).max(50).optional() }),
    annotations: { readOnlyHint: true },
  }, async ({ query, dayOfWeek, limit }) => {
    if (!actorCan(actor, "SmallGroups", "Read")) return denied("DGroups")
    return text(await querySmallGroups({ query, dayOfWeek, limit }))
  })

  server.registerTool("get_dgroup", {
    title: "Get DGroup details", description: "Return one DGroup's leader, schedule, roster, and requests.",
    inputSchema: z.object({ groupId: z.string() }), annotations: { readOnlyHint: true },
  }, async ({ groupId }) => {
    if (!actorCan(actor, "SmallGroups", "Read")) return denied("DGroups")
    return text((await getSmallGroupDetail(groupId)) ?? { error: "DGroup not found." })
  })

  server.registerTool("search_events", {
    title: "Search events", description: "Search Churchie events.",
    inputSchema: z.object({ query: z.string().optional(), timeframe: z.enum(["upcoming", "past", "all"]).optional(), limit: z.number().int().min(1).max(50).optional() }), annotations: { readOnlyHint: true },
  }, async (input) => {
    if (!actorCan(actor, "Events", "Read")) return denied("Events")
    const result = await queryEvents(input)
    if (actor.role === "SuperAdmin" || actor.eventAccess.size === 0) return text(result)
    return text(toAssistantList(result.rows.filter((event) => actorCanAccessEvent(actor, event.id)), result.rows.length))
  })

  server.registerTool("search_volunteers", {
    title: "Search volunteers", description: "Search event and ministry volunteers.",
    inputSchema: z.object({ eventId: z.string().optional(), query: z.string().optional(), limit: z.number().int().min(1).max(50).optional() }), annotations: { readOnlyHint: true },
  }, async (input) => {
    if (!actorCan(actor, "Volunteers", "Read")) return denied("Volunteers")
    if (actor.role !== "SuperAdmin" && actor.eventAccess.size > 0) {
      if (!input.eventId) return text({ error: "Choose an event before searching volunteers." })
      if (!actorCanAccessEvent(actor, input.eventId)) return denied("this event")
    }
    return text(await queryVolunteers(input))
  })

  server.registerTool("search_ministries", {
    title: "Search ministries", description: "Search ministries before managing events or ministry details.",
    inputSchema: z.object({ query: z.string().optional(), limit: z.number().int().min(1).max(50).optional() }), annotations: { readOnlyHint: true },
  }, async (input) => {
    if (!actorCan(actor, "Ministries", "Read")) return denied("Ministries")
    return text(await queryMinistries(input))
  })

  server.registerTool("get_event", {
    title: "Get event details", description: "Get an event and its scoped related records before changing it.",
    inputSchema: z.object({ eventId: z.string() }), annotations: { readOnlyHint: true },
  }, async ({ eventId }) => {
    if (!actorCanAccessEvent(actor, eventId)) return denied("this event")
    return text((await getEventDetail(eventId)) ?? { error: "Event not found." })
  })

  server.registerTool("search_event_registrants", {
    title: "Search event registrants", description: "Search registrants for one event.",
    inputSchema: z.object({ eventId: z.string(), query: z.string().optional(), limit: z.number().int().min(1).max(50).optional() }), annotations: { readOnlyHint: true },
  }, async (input) => {
    if (!actorCanAccessEvent(actor, input.eventId)) return denied("this event")
    return text(await queryEventRegistrants(input))
  })

  server.registerTool("search_families", {
    title: "Search families", description: "Search families by household name.",
    inputSchema: z.object({ query: z.string().optional(), limit: z.number().int().min(1).max(50).optional() }), annotations: { readOnlyHint: true },
  }, async ({ query, limit = 20 }) => {
    if (!actorCan(actor, "Members", "Read")) return denied("Families")
    const rows = await db.family.findMany({ where: query ? { name: { contains: query.trim(), mode: "insensitive" } } : {}, orderBy: { name: "asc" }, take: limit, select: { id: true, name: true, notes: true, _count: { select: { members: true } } } })
    return text({ rows: rows.map(({ _count, ...family }) => ({ ...family, memberCount: _count.members })), totalCount: rows.length })
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
