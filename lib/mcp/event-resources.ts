import "server-only"

import { z } from "zod"
import { db } from "@/lib/db"
import { formatPhilippinePhone } from "@/lib/utils"
import { actorCan, actorCanWriteEvent, type McpActor } from "./auth"

type Result = { success: true; data: Record<string, unknown> } | { success: false; error: string }
const fail = (error: string): Result => ({ success: false, error })
const allowed = (actor: McpActor, eventId: string, destructive = false) =>
  actorCan(actor, "Events", "Write") && actorCanWriteEvent(actor, eventId) && (!destructive || actor.role === "SuperAdmin")

export const registrantInputSchema = z.object({
  eventId: z.string().min(1), memberId: z.string().min(1).optional(), guestId: z.string().min(1).optional(),
  firstName: z.string().trim().min(1).max(100).optional(), lastName: z.string().trim().min(1).max(100).optional(),
  nickname: z.string().trim().max(100).nullable().optional(), email: z.string().email().nullable().optional(),
  mobileNumber: z.string().trim().nullable().optional(), isPaid: z.boolean().default(false),
  paymentReference: z.string().trim().max(255).nullable().optional(), attendedAt: z.string().datetime({ offset: true }).nullable().optional(),
}).superRefine((value, ctx) => {
  const identities = Number(Boolean(value.memberId)) + Number(Boolean(value.guestId)) + Number(Boolean(value.firstName && value.lastName))
  if (identities !== 1) ctx.addIssue({ code: "custom", message: "Provide exactly one identity: memberId, guestId, or anonymous first and last name." })
  if (value.isPaid && !value.paymentReference) ctx.addIssue({ code: "custom", message: "A payment reference is required when marking a registration paid." })
})

export const registrantUpdateSchema = z.object({
  eventId: z.string().min(1), nickname: z.string().trim().max(100).nullable().optional(),
  isPaid: z.boolean().optional(), paymentReference: z.string().trim().max(255).nullable().optional(),
  attendedAt: z.string().datetime({ offset: true }).nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.isPaid === true && !value.paymentReference) ctx.addIssue({ code: "custom", message: "A payment reference is required when marking a registration paid." })
})

export async function mutateEventRegistrant(actor: McpActor, action: "create" | "update" | "delete", id: string | undefined, raw: unknown): Promise<Result> {
  const eventId = z.object({ eventId: z.string().min(1) }).safeParse(raw)
  if (!eventId.success) return fail("Event ID is required.")
  if (!allowed(actor, eventId.data.eventId, action === "delete")) return fail(action === "delete" ? "Only a Super Admin with access to this event can delete registrants." : "You do not have write access to this event.")
  if (action === "delete") {
    if (!id) return fail("Registrant ID is required.")
    const row = await db.eventRegistrant.findFirst({ where: { id, eventId: eventId.data.eventId }, select: { id: true } })
    if (!row) return fail("Registrant not found in this event.")
    try { await db.eventRegistrant.delete({ where: { id } }); return { success: true, data: { id, eventId: eventId.data.eventId } } } catch { return fail("Unable to delete this registrant because related records still require it.") }
  }
  if (action === "update") {
    const parsed = registrantUpdateSchema.safeParse(raw); if (!parsed.success || !id) return fail(parsed.success ? "Registrant ID is required." : parsed.error.issues[0]?.message ?? "Invalid input.")
    const current = await db.eventRegistrant.findFirst({ where: { id, eventId: parsed.data.eventId }, select: { id: true, isPaid: true, paymentReference: true } }); if (!current) return fail("Registrant not found in this event.")
    const { eventId: _, attendedAt, ...rest } = parsed.data
    const data = { ...rest, ...(attendedAt !== undefined ? { attendedAt: attendedAt === null ? null : new Date(attendedAt) } : {}) }
    if ((data.isPaid ?? current.isPaid) && !(data.paymentReference ?? current.paymentReference)) return fail("A payment reference is required when the registration is paid.")
    try { const record = await db.eventRegistrant.update({ where: { id }, data, select: { id: true, eventId: true, isPaid: true, paymentReference: true, attendedAt: true } }); return { success: true, data: record } } catch { return fail("Failed to update registrant.") }
  }
  const parsed = registrantInputSchema.safeParse(raw); if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.")
  const { eventId: targetEventId, mobileNumber, ...values } = parsed.data
  if (values.memberId && !await db.member.findUnique({ where: { id: values.memberId }, select: { id: true } })) return fail("Member not found.")
  if (values.guestId && !await db.guest.findFirst({ where: { id: values.guestId, memberId: null }, select: { id: true } })) return fail("Active guest not found.")
  const identityFilter = values.memberId ? { memberId: values.memberId } : values.guestId ? { guestId: values.guestId } : null
  const duplicate = identityFilter ? await db.eventRegistrant.findFirst({ where: { eventId: targetEventId, ...identityFilter }, select: { id: true } }) : null
  if (duplicate) return fail("This person is already registered for the event.")
  const attendedAt = values.attendedAt === null || values.attendedAt === undefined ? values.attendedAt : new Date(values.attendedAt)
  try { const record = await db.eventRegistrant.create({ data: { eventId: targetEventId, ...values, attendedAt, mobileNumber: mobileNumber ? formatPhilippinePhone(mobileNumber) : null }, select: { id: true, eventId: true, memberId: true, guestId: true } }); return { success: true, data: record } } catch { return fail("Failed to create registrant.") }
}

export const occurrenceSchema = z.object({ eventId: z.string().min(1), date: z.string().datetime({ offset: true }), notes: z.string().trim().max(1000).nullable().optional(), isOpen: z.boolean().default(false), isStandalone: z.boolean().default(false) })
export async function mutateEventOccurrence(actor: McpActor, action: "create" | "update" | "delete", id: string | undefined, raw: unknown): Promise<Result> {
  const parsed = (action === "delete" ? z.object({ eventId: z.string().min(1) }) : occurrenceSchema).safeParse(raw); if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.")
  if (!allowed(actor, parsed.data.eventId, action === "delete")) return fail(action === "delete" ? "Only a Super Admin with access to this event can delete sessions." : "You do not have write access to this event.")
  const event = await db.event.findUnique({ where: { id: parsed.data.eventId }, select: { type: true } }); if (!event) return fail("Event not found.")
  if (event.type === "OneTime") return fail("One-time events do not use sessions.")
  if (action !== "create") { const row = id ? await db.eventOccurrence.findFirst({ where: { id, eventId: parsed.data.eventId }, select: { id: true } }) : null; if (!row) return fail("Session not found in this event.") }
  if (action === "delete" && event.type !== "Recurring") return fail("Only recurring sessions can be deleted.")
  try {
    if (action === "delete") { await db.eventOccurrence.delete({ where: { id: id! } }); return { success: true, data: { id: id!, eventId: parsed.data.eventId } } }
    const values = occurrenceSchema.parse(parsed.data)
    const data = { date: new Date(values.date), notes: values.notes ?? null, isOpen: values.isOpen, isStandalone: values.isStandalone }
    const record = action === "create" ? await db.eventOccurrence.create({ data: { eventId: parsed.data.eventId, ...data }, select: { id: true, eventId: true, date: true, isOpen: true } }) : await db.eventOccurrence.update({ where: { id: id! }, data, select: { id: true, eventId: true, date: true, isOpen: true } })
    return { success: true, data: record }
  } catch { return fail("Failed to save session; another session may already use that date.") }
}

export const committeeSchema = z.object({ eventId: z.string().min(1), name: z.string().trim().min(1).max(150) })
export const committeeRoleSchema = z.object({ eventId: z.string().min(1), committeeId: z.string().min(1), name: z.string().trim().min(1).max(150) })
export async function mutateCommittee(actor: McpActor, action: "create" | "update" | "delete", id: string | undefined, raw: unknown): Promise<Result> {
  const parsed = (action === "delete" ? z.object({ eventId: z.string().min(1) }) : committeeSchema).safeParse(raw); if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.")
  if (!allowed(actor, parsed.data.eventId, action === "delete")) return fail(action === "delete" ? "Only a Super Admin with access to this event can delete committees." : "You do not have write access to this event.")
  if (action !== "create" && !await db.volunteerCommittee.findFirst({ where: { id: id!, eventId: parsed.data.eventId }, select: { id: true } })) return fail("Committee not found in this event.")
  try { if (action === "delete") { await db.volunteerCommittee.delete({ where: { id: id! } }); return { success: true, data: { id: id! } } }; const values = committeeSchema.parse(parsed.data); const record = action === "create" ? await db.volunteerCommittee.create({ data: values, select: { id: true, eventId: true, name: true } }) : await db.volunteerCommittee.update({ where: { id: id! }, data: { name: values.name }, select: { id: true, eventId: true, name: true } }); return { success: true, data: record } } catch { return fail("Unable to save committee; volunteers or roles may still depend on it.") }
}

export async function mutateCommitteeRole(actor: McpActor, action: "create" | "update" | "delete", id: string | undefined, raw: unknown): Promise<Result> {
  const parsed = (action === "delete" ? committeeRoleSchema.omit({ name: true }) : committeeRoleSchema).safeParse(raw); if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.")
  if (!allowed(actor, parsed.data.eventId, action === "delete")) return fail(action === "delete" ? "Only a Super Admin with access to this event can delete roles." : "You do not have write access to this event.")
  const committee = await db.volunteerCommittee.findFirst({ where: { id: parsed.data.committeeId, eventId: parsed.data.eventId }, select: { id: true } }); if (!committee) return fail("Committee not found in this event.")
  if (action !== "create" && !await db.committeeRole.findFirst({ where: { id: id!, committeeId: parsed.data.committeeId }, select: { id: true } })) return fail("Role not found in this committee.")
  try { if (action === "delete") { await db.committeeRole.delete({ where: { id: id! } }); return { success: true, data: { id: id! } } }; const values = committeeRoleSchema.parse(parsed.data); const record = action === "create" ? await db.committeeRole.create({ data: { committeeId: values.committeeId, name: values.name }, select: { id: true, committeeId: true, name: true } }) : await db.committeeRole.update({ where: { id: id! }, data: { name: values.name }, select: { id: true, committeeId: true, name: true } }); return { success: true, data: record } } catch { return fail("Unable to save role; volunteer assignments may still depend on it.") }
}
