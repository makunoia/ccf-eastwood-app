# Volunteers — Event-Only Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove ministry-scoped volunteering so all volunteer records belong solely to events, repurpose the top-level `/volunteers` page to a member-grouped view, and repurpose the ministry volunteer sign-up page to list upcoming events.

**Architecture:** Start with the Prisma schema migration (deletes data + drops columns), update validations and actions, then work up through import, forms, the volunteers list page, event workspace, and finally the ministry pages.

**Tech Stack:** Next.js App Router, TypeScript, Prisma 7 (PrismaPg), Zod, TanStack Table, shadcn/ui, Tailwind CSS v4, Sonner toasts.

---

## Task 1: Prisma schema migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create (auto + edit): `prisma/migrations/<timestamp>_volunteers_event_only/migration.sql`

- [ ] **Step 1: Update prisma/schema.prisma**

  Apply these exact diffs:

  **`VolunteerCommittee` model** — remove `ministryId`/`ministry` fields, make `eventId` required:
  ```prisma
  model VolunteerCommittee {
    id        String  @id @default(cuid())
    name      String
    eventId   String
    event     Event   @relation(fields: [eventId], references: [id])
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt

    roles      CommitteeRole[]
    volunteers Volunteer[]
  }
  ```

  **`Volunteer` model** — remove `ministryId`/`ministry` fields, make `eventId` required:
  ```prisma
  model Volunteer {
    id              String             @id @default(cuid())
    memberId        String
    member          Member             @relation(fields: [memberId], references: [id])
    eventId         String
    event           Event              @relation(fields: [eventId], references: [id])
    committeeId     String
    committee       VolunteerCommittee @relation(fields: [committeeId], references: [id])
    preferredRoleId String
    preferredRole   CommitteeRole      @relation("PreferredRole", fields: [preferredRoleId], references: [id])
    assignedRoleId  String?
    assignedRole    CommitteeRole?     @relation("AssignedRole", fields: [assignedRoleId], references: [id])
    status               VolunteerStatus    @default(Pending)
    notes                String?
    leaderApprovalToken  String?           @unique
    leaderNotes          String?
    createdAt            DateTime          @default(now())
    updatedAt            DateTime          @updatedAt

    facilitatedGroups   BreakoutGroup[] @relation("FacilitatedGroups")
    coFacilitatedGroups BreakoutGroup[] @relation("CoFacilitatedGroups")
    busPassengers       BusPassenger[]
    catchMechSessions   CatchMechSession[]
  }
  ```

  **`Ministry` model** — remove the `committees` and `volunteers` back-relations (find the Ministry model and delete those two lines):
  ```prisma
  // Remove these two lines from the Ministry model:
  //   committees VolunteerCommittee[]
  //   volunteers Volunteer[]
  ```

- [ ] **Step 2: Create migration with data-cleanup SQL**

  Run the migration in dev mode:
  ```bash
  pnpm prisma migrate dev --name volunteers_event_only
  ```

  When prompted to enter a name, it is already named. Prisma will generate the migration file. **Edit the generated migration file** to prepend the delete statements BEFORE the `ALTER TABLE` statements:

  ```sql
  -- Delete ministry-scoped volunteer records before removing columns
  DELETE FROM "Volunteer" WHERE "ministryId" IS NOT NULL AND "eventId" IS NULL;
  DELETE FROM "VolunteerCommittee" WHERE "ministryId" IS NOT NULL AND "eventId" IS NULL;

  -- (Prisma-generated ALTER TABLE statements follow below — do not remove them)
  ```

  After editing, run the migration again if it hasn't applied yet, or apply it:
  ```bash
  pnpm prisma migrate dev
  ```

- [ ] **Step 3: Regenerate Prisma client**

  ```bash
  pnpm prisma generate
  ```

- [ ] **Step 4: Verify TypeScript compiles (expect many errors — that's fine for now)**

  ```bash
  pnpm tsc --noEmit 2>&1 | head -40
  ```

  Expected: errors referencing `ministryId`, `ministry`, `scopeType` across many files. These are all addressed in subsequent tasks.

- [ ] **Step 5: Commit**

  ```bash
  git add prisma/schema.prisma prisma/migrations/
  git commit -m "feat: migrate volunteers to event-only schema"
  ```

---

## Task 2: Update Zod validations

**Files:**
- Modify: `lib/validations/volunteer.ts`

- [ ] **Step 1: Replace the entire file**

  ```typescript
  import { z } from "zod"

  const nullableString = z
    .string()
    .optional()
    .transform((v) => (v === "" || v == null ? null : v.trim()))

  // ─── Create schema ────────────────────────────────────────────────────────────

  export const createVolunteerSchema = z.object({
    memberId: z.string().min(1, "Member is required"),
    eventId: z.string().min(1, "Event is required"),
    committeeId: z.string().min(1, "Committee is required"),
    preferredRoleId: z.string().min(1, "Preferred role is required"),
    notes: nullableString,
  })

  // ─── Update schema ────────────────────────────────────────────────────────────

  export const updateVolunteerSchema = z.object({
    memberId: z.string().min(1, "Member is required"),
    eventId: z.string().min(1, "Event is required"),
    committeeId: z.string().min(1, "Committee is required"),
    preferredRoleId: z.string().min(1, "Preferred role is required"),
    assignedRoleId: nullableString,
    status: z.enum(["Pending", "Confirmed", "Rejected"]),
    notes: nullableString,
  })

  // ─── Committee schemas ────────────────────────────────────────────────────────

  export const committeeSchema = z.object({
    name: z.string().min(1, "Committee name is required").trim(),
  })

  export const roleSchema = z.object({
    name: z.string().min(1, "Role name is required").trim(),
  })

  // ─── Types ────────────────────────────────────────────────────────────────────

  export type CreateVolunteerInput = z.infer<typeof createVolunteerSchema>
  export type UpdateVolunteerInput = z.infer<typeof updateVolunteerSchema>

  export type VolunteerFormValues = {
    memberId: string
    eventId: string
    committeeId: string
    preferredRoleId: string
    assignedRoleId: string
    status: "Pending" | "Confirmed" | "Rejected" | ""
    notes: string
  }

  export const defaultVolunteerForm: VolunteerFormValues = {
    memberId: "",
    eventId: "",
    committeeId: "",
    preferredRoleId: "",
    assignedRoleId: "",
    status: "",
    notes: "",
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add lib/validations/volunteer.ts
  git commit -m "feat: remove ministry scope from volunteer validations"
  ```

---

## Task 3: Update server actions

**Files:**
- Modify: `app/(dashboard)/volunteers/actions.ts`
- Modify: `app/volunteers/sign-up-actions.ts`

- [ ] **Step 1: Replace `app/(dashboard)/volunteers/actions.ts`**

  ```typescript
  "use server"

  import { revalidatePath } from "next/cache"
  import { Prisma } from "@/app/generated/prisma/client"
  import { db } from "@/lib/db"
  import {
    createVolunteerSchema,
    updateVolunteerSchema,
    type VolunteerFormValues,
  } from "@/lib/validations/volunteer"

  type ActionResult<T = void> =
    | { success: true; data: T }
    | { success: false; error: string }

  export async function lookupMemberByMobile(mobile: string): Promise<{
    id: string
    firstName: string
    lastName: string
    email: string | null
  } | null> {
    const member = await db.member.findFirst({
      where: { phone: mobile.trim() },
      select: { id: true, firstName: true, lastName: true, email: true },
    })
    return member
  }

  export async function createVolunteer(
    raw: VolunteerFormValues
  ): Promise<ActionResult<{ id: string }>> {
    const parsed = createVolunteerSchema.safeParse(raw)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
    }

    const { memberId, eventId, committeeId, preferredRoleId, notes } = parsed.data

    const existing = await db.volunteer.findFirst({
      where: { memberId, eventId },
    })
    if (existing) {
      return {
        success: false,
        error: "This member is already registered as a volunteer for this event",
      }
    }

    try {
      const volunteer = await db.volunteer.create({
        data: {
          memberId,
          eventId,
          committeeId,
          preferredRoleId,
          notes: notes ?? null,
          leaderApprovalToken: crypto.randomUUID(),
        },
        select: { id: true },
      })
      revalidatePath("/volunteers")
      return { success: true, data: { id: volunteer.id } }
    } catch (e: unknown) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return {
          success: false,
          error: "This member is already registered as a volunteer for this event",
        }
      }
      return { success: false, error: "Failed to create volunteer" }
    }
  }

  export async function updateVolunteer(
    id: string,
    raw: VolunteerFormValues
  ): Promise<ActionResult> {
    const parsed = updateVolunteerSchema.safeParse(raw)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
    }

    const { memberId, eventId, committeeId, preferredRoleId, assignedRoleId, status, notes } =
      parsed.data

    try {
      await db.volunteer.update({
        where: { id },
        data: {
          memberId,
          eventId,
          committeeId,
          preferredRoleId,
          assignedRoleId: assignedRoleId ?? null,
          status,
          notes: notes ?? null,
        },
      })
      revalidatePath("/volunteers")
      revalidatePath(`/volunteers/${id}`)
      return { success: true, data: undefined }
    } catch {
      return { success: false, error: "Failed to update volunteer" }
    }
  }

  export async function deleteVolunteer(id: string): Promise<ActionResult> {
    try {
      await db.volunteer.delete({ where: { id } })
      revalidatePath("/volunteers")
      return { success: true, data: undefined }
    } catch {
      return { success: false, error: "Failed to delete volunteer" }
    }
  }
  ```

- [ ] **Step 2: Replace `app/volunteers/sign-up-actions.ts`**

  ```typescript
  "use server"

  import { db } from "@/lib/db"

  export async function lookupMemberByMobile(mobile: string): Promise<{
    id: string
    firstName: string
    lastName: string
    email: string | null
  } | null> {
    const member = await db.member.findFirst({
      where: { phone: mobile.trim() },
      select: { id: true, firstName: true, lastName: true, email: true },
    })
    return member
  }

  type SignUpInput = {
    memberId: string
    eventId: string
    committeeId: string
    preferredRoleId: string
    notes: string
  }

  type ActionResult<T = void> =
    | { success: true; data: T }
    | { success: false; error: string }

  export async function submitVolunteerSignUp(
    input: SignUpInput
  ): Promise<ActionResult<{ id: string }>> {
    const { memberId, eventId, committeeId, preferredRoleId, notes } = input

    if (!eventId) {
      return { success: false, error: "Invalid sign-up context" }
    }
    if (!committeeId || !preferredRoleId) {
      return { success: false, error: "Please select a committee and role" }
    }

    const existing = await db.volunteer.findFirst({
      where: { memberId, eventId },
    })
    if (existing) {
      return {
        success: false,
        error: "You're already registered as a volunteer for this event",
      }
    }

    try {
      const volunteer = await db.volunteer.create({
        data: {
          memberId,
          eventId,
          committeeId,
          preferredRoleId,
          notes: notes.trim() || null,
          leaderApprovalToken: crypto.randomUUID(),
          status: "Pending",
        },
        select: { id: true },
      })
      return { success: true, data: { id: volunteer.id } }
    } catch {
      return { success: false, error: "Failed to submit your application. Please try again." }
    }
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add app/(dashboard)/volunteers/actions.ts app/volunteers/sign-up-actions.ts
  git commit -m "feat: remove ministry scope from volunteer actions"
  ```

---

## Task 4: Update import actions and import trigger

**Files:**
- Modify: `app/(dashboard)/volunteers/import-actions.ts`
- Modify: `app/(dashboard)/volunteers/volunteer-import-trigger.tsx`

- [ ] **Step 1: Replace `app/(dashboard)/volunteers/import-actions.ts`**

  Remove `ministryId` from `VolunteerContext`, from the committees query, and from `db.volunteer.create`. Also remove the ministry `revalidatePath`.

  ```typescript
  "use server"

  import { revalidatePath } from "next/cache"
  import { db } from "@/lib/db"
  import type { DuplicateMatch, ImportResult, RowResolution } from "@/lib/import/types"
  import { Gender, MeetingPreference, VolunteerStatus, Prisma } from "@/app/generated/prisma/client"
  import { toTitleCase, formatPhilippinePhone } from "@/lib/utils"

  type ActionResult<T = void> =
    | { success: true; data: T }
    | { success: false; error: string }

  export async function checkVolunteerDuplicates(
    rows: { email?: string; phone?: string }[]
  ): Promise<ActionResult<DuplicateMatch[]>> {
    try {
      const emails = rows.map((r) => r.email).filter(Boolean) as string[]
      const phones = rows
        .map((r) => (r.phone ? formatPhilippinePhone(r.phone) : undefined))
        .filter(Boolean) as string[]

      const members = await db.member.findMany({
        where: {
          OR: [
            emails.length > 0 ? { email: { in: emails } } : undefined,
            phones.length > 0 ? { phone: { in: phones } } : undefined,
          ].filter(Boolean) as Prisma.MemberWhereInput[],
        },
        select: { id: true, firstName: true, lastName: true, email: true, phone: true },
      })

      const byEmail = new Map(members.filter((m) => m.email).map((m) => [m.email!, m]))
      const byPhone = new Map(members.filter((m) => m.phone).map((m) => [m.phone!, m]))

      const matches: DuplicateMatch[] = []
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const match =
          (row.email && byEmail.get(row.email)) || (row.phone && byPhone.get(row.phone))
        if (match) {
          matches.push({
            rowIndex: i,
            existingId: match.id,
            existingType: "member",
            existingName: `${match.firstName} ${match.lastName}`,
            existingEmail: match.email,
            existingPhone: match.phone,
          })
        }
      }
      return { success: true, data: matches }
    } catch {
      return { success: false, error: "Failed to check duplicates" }
    }
  }

  type ImportRow = {
    mapped: Record<string, string>
    resolution: RowResolution
    existingId?: string
  }

  type VolunteerContext = {
    eventId: string
  }

  function parseGender(v: string): Gender | null {
    const n = v.toLowerCase()
    if (n === "male" || n === "m") return Gender.Male
    if (n === "female" || n === "f") return Gender.Female
    return null
  }

  function parseMeetingPreference(v: string): MeetingPreference | null {
    const n = v.toLowerCase()
    if (n === "online") return MeetingPreference.Online
    if (n === "hybrid") return MeetingPreference.Hybrid
    if (n === "inperson" || n === "in person" || n === "in-person") return MeetingPreference.InPerson
    return null
  }

  function parseVolunteerStatus(v: string): VolunteerStatus {
    const n = v.toLowerCase()
    if (n === "confirmed") return VolunteerStatus.Confirmed
    if (n === "rejected") return VolunteerStatus.Rejected
    return VolunteerStatus.Pending
  }

  export async function importVolunteers(
    context: VolunteerContext,
    rows: ImportRow[]
  ): Promise<ActionResult<ImportResult>> {
    if (!context.eventId) {
      return { success: false, error: "An event context is required" }
    }

    const result: ImportResult = {
      total: rows.length,
      created: 0,
      linked: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    }

    const committees = await db.volunteerCommittee.findMany({
      where: { eventId: context.eventId },
      include: { roles: { select: { id: true, name: true } } },
    })

    const committeeByName = new Map(committees.map((c) => [c.name.toLowerCase(), c]))

    for (let i = 0; i < rows.length; i++) {
      const { mapped, resolution, existingId } = rows[i]
      try {
        const firstName = mapped.firstName ? toTitleCase(mapped.firstName) : ""
        const lastName = mapped.lastName ? toTitleCase(mapped.lastName) : ""

        if (!firstName || !lastName) {
          result.errors.push({ row: i, message: "First name and last name are required" })
          result.skipped++
          continue
        }

        const committeeName = mapped.committeeName?.trim()
        if (!committeeName) {
          result.errors.push({ row: i, message: "Committee name is required" })
          result.skipped++
          continue
        }
        const committee = committeeByName.get(committeeName.toLowerCase())
        if (!committee) {
          result.errors.push({ row: i, message: `Committee not found: "${committeeName}"` })
          result.skipped++
          continue
        }

        const roleName = mapped.roleName?.trim()
        if (!roleName) {
          result.errors.push({ row: i, message: "Role name is required" })
          result.skipped++
          continue
        }
        const role = committee.roles.find(
          (r) => r.name.toLowerCase() === roleName.toLowerCase()
        )
        if (!role) {
          result.errors.push({
            row: i,
            message: `Role not found: "${roleName}" in committee "${committeeName}"`,
          })
          result.skipped++
          continue
        }

        let memberId: string

        if (existingId && resolution === "use-existing") {
          memberId = existingId
        } else if (existingId && resolution === "use-csv") {
          await db.member.update({
            where: { id: existingId },
            data: {
              firstName,
              lastName,
              email: mapped.email?.trim() || null,
              phone: mapped.phone ? formatPhilippinePhone(mapped.phone) : null,
              gender: mapped.gender ? parseGender(mapped.gender) : undefined,
              language: mapped.language?.trim() ? [mapped.language.trim()] : [],
              meetingPreference: mapped.meetingPreference
                ? parseMeetingPreference(mapped.meetingPreference)
                : undefined,
            },
          })
          memberId = existingId
        } else {
          const member = await db.member.create({
            data: {
              firstName,
              lastName,
              email: mapped.email?.trim() || null,
              phone: mapped.phone ? formatPhilippinePhone(mapped.phone) : null,
              dateJoined: new Date(),
              gender: mapped.gender ? parseGender(mapped.gender) : null,
              language: mapped.language?.trim() ? [mapped.language.trim()] : [],
              meetingPreference: mapped.meetingPreference
                ? parseMeetingPreference(mapped.meetingPreference)
                : null,
              notes: mapped.notes?.trim() || null,
            },
            select: { id: true },
          })
          memberId = member.id
          result.created++
        }

        const alreadyVolunteer = await db.volunteer.findFirst({
          where: { memberId, committeeId: committee.id },
          select: { id: true },
        })
        if (alreadyVolunteer) {
          result.skipped++
          continue
        }

        await db.volunteer.create({
          data: {
            memberId,
            eventId: context.eventId,
            committeeId: committee.id,
            preferredRoleId: role.id,
            status: mapped.status ? parseVolunteerStatus(mapped.status) : VolunteerStatus.Pending,
            notes: mapped.notes?.trim() || null,
          },
        })

        if (existingId) {
          result.linked++
        }
      } catch (e) {
        const msg =
          e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
            ? "Duplicate record"
            : "Failed to save record"
        result.errors.push({ row: i, message: msg })
        result.skipped++
      }
    }

    revalidatePath(`/event/${context.eventId}/volunteers`)
    revalidatePath("/volunteers")

    return { success: true, data: result }
  }
  ```

- [ ] **Step 2: Replace `app/(dashboard)/volunteers/volunteer-import-trigger.tsx`**

  Remove ministry scope — the trigger now only asks the user to select an event.

  ```typescript
  "use client"

  import * as React from "react"
  import { IconUpload } from "@tabler/icons-react"
  import { Button } from "@/components/ui/button"
  import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogDescription,
  } from "@/components/ui/dialog"
  import { ImportWizard } from "@/components/import/import-wizard"
  import { checkVolunteerDuplicates, importVolunteers } from "./import-actions"

  type Props = {
    events: { id: string; name: string }[]
  }

  export function VolunteerImportTrigger({ events }: Props) {
    const [dialogOpen, setDialogOpen] = React.useState(false)
    const [importOpen, setImportOpen] = React.useState(false)
    const [selectedId, setSelectedId] = React.useState(events[0]?.id ?? "")

    function handleOpen() {
      setSelectedId(events[0]?.id ?? "")
      setDialogOpen(true)
    }

    function handleConfirm() {
      if (!selectedId) return
      setDialogOpen(false)
      setImportOpen(true)
    }

    const context = { eventId: selectedId }

    return (
      <>
        <Button variant="outline" onClick={handleOpen}>
          <IconUpload className="size-4" />
          <span className="hidden sm:inline">Import</span>
        </Button>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Import Volunteers</DialogTitle>
              <DialogDescription>
                Select the event you&apos;re importing volunteers for.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Event</label>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {events.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
                {events.length === 0 && (
                  <option disabled value="">
                    No events available
                  </option>
                )}
              </select>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleConfirm} disabled={!selectedId}>
                Continue
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ImportWizard
          config={{ entity: "volunteer", context }}
          open={importOpen}
          onOpenChange={setImportOpen}
          onCheckDuplicates={checkVolunteerDuplicates}
          onImport={(rows) => importVolunteers(context, rows)}
        />
      </>
    )
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add app/(dashboard)/volunteers/import-actions.ts app/(dashboard)/volunteers/volunteer-import-trigger.tsx
  git commit -m "feat: update volunteer import to event-only context"
  ```

---

## Task 5: Update volunteer form and edit page

**Files:**
- Modify: `app/(dashboard)/volunteers/volunteer-form.tsx`
- Modify: `app/(dashboard)/volunteers/[id]/page.tsx`
- Delete: `app/(dashboard)/volunteers/new/page.tsx`

- [ ] **Step 1: Replace `app/(dashboard)/volunteers/volunteer-form.tsx`**

  Remove ministry scope, scopeType, and affiliated-ministry committee grouping.

  ```typescript
  "use client"

  import * as React from "react"
  import Link from "next/link"
  import { useRouter } from "next/navigation"
  import { IconArrowLeft, IconCopy } from "@tabler/icons-react"
  import { toast } from "sonner"

  import { Badge } from "@/components/ui/badge"
  import { Button } from "@/components/ui/button"
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from "@/components/ui/dialog"
  import { Label } from "@/components/ui/label"
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from "@/components/ui/select"
  import { Textarea } from "@/components/ui/textarea"
  import {
    defaultVolunteerForm,
    type VolunteerFormValues,
  } from "@/lib/validations/volunteer"
  import { createVolunteer, updateVolunteer, deleteVolunteer } from "./actions"
  import { MobileFormActions } from "@/components/mobile-form-actions"

  type CommitteeRole = { id: string; name: string }
  type Committee = { id: string; name: string; roles: CommitteeRole[] }
  type Event = { id: string; name: string; committees: Committee[] }

  type VolunteerDetail = {
    id: string
    memberName: string
    eventName: string
    committee: string
    preferredRole: string
    assignedRole: string | null
    status: "Pending" | "Confirmed" | "Rejected"
    memberId: string
    eventId: string
    committeeId: string
    preferredRoleId: string
    assignedRoleId: string | null
    notes: string | null
    leaderApprovalToken: string | null
    leaderNotes: string | null
  }

  type Props = {
    members: { id: string; firstName: string; lastName: string }[]
    events: Event[]
    volunteer?: VolunteerDetail
  }

  const STATUS_VARIANT = {
    Pending: "secondary",
    Confirmed: "default",
    Rejected: "destructive",
  } as const

  function toFormValues(v: VolunteerDetail): VolunteerFormValues {
    return {
      memberId: v.memberId,
      eventId: v.eventId,
      committeeId: v.committeeId,
      preferredRoleId: v.preferredRoleId,
      assignedRoleId: v.assignedRoleId ?? "",
      status: v.status,
      notes: v.notes ?? "",
    }
  }

  export function VolunteerForm({ members, events, volunteer }: Props) {
    const router = useRouter()
    const isEdit = !!volunteer
    const [form, setForm] = React.useState<VolunteerFormValues>(
      () => (volunteer ? toFormValues(volunteer) : defaultVolunteerForm)
    )
    const [saving, setSaving] = React.useState(false)
    const [deleteOpen, setDeleteOpen] = React.useState(false)
    const [deleting, setDeleting] = React.useState(false)

    function set<K extends keyof VolunteerFormValues>(field: K, value: VolunteerFormValues[K]) {
      setForm((prev) => ({ ...prev, [field]: value }))
    }

    function handleRevert() {
      setForm(volunteer ? toFormValues(volunteer) : defaultVolunteerForm)
    }

    const eventCommittees =
      events.find((e) => e.id === form.eventId)?.committees ?? []
    const selectedCommittee = eventCommittees.find((c) => c.id === form.committeeId)
    const committeeRoles = selectedCommittee?.roles ?? []

    async function handleSubmit(e: React.FormEvent) {
      e.preventDefault()
      setSaving(true)

      const result = isEdit
        ? await updateVolunteer(volunteer!.id, form)
        : await createVolunteer(form)

      setSaving(false)

      if (result.success) {
        toast.success(isEdit ? "Volunteer updated" : "Volunteer added")
        router.push("/volunteers")
      } else {
        toast.error(result.error)
      }
    }

    async function handleDelete() {
      setDeleting(true)
      const result = await deleteVolunteer(volunteer!.id)
      setDeleting(false)
      if (result.success) {
        toast.success("Volunteer deleted")
        router.push("/volunteers")
      } else {
        toast.error(result.error)
      }
    }

    const approvalUrl =
      volunteer?.leaderApprovalToken
        ? `${typeof window !== "undefined" ? window.location.origin : ""}/volunteer-approval/${volunteer.leaderApprovalToken}`
        : null

    async function copyApprovalLink() {
      if (!approvalUrl) return
      await navigator.clipboard.writeText(approvalUrl)
      toast.success("Approval link copied")
    }

    return (
      <div className="flex flex-1 flex-col gap-6 p-6 pb-24 sm:pb-6">
        <div>
          <Link
            href="/volunteers"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <IconArrowLeft className="size-4" />
            Volunteers
          </Link>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">
              {isEdit ? volunteer!.memberName : "New Volunteer"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {isEdit
                ? "Edit volunteer details and assignment."
                : "Register a member as a volunteer."}
            </p>
          </div>
          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            {isEdit && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setDeleteOpen(true)}
                disabled={saving}
              >
                Delete
              </Button>
            )}
            <Button type="submit" form="volunteer-form" disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Save changes" : "Add volunteer"}
            </Button>
          </div>
        </div>

        <form id="volunteer-form" onSubmit={handleSubmit} className="max-w-2xl space-y-6">
          {/* Member */}
          <div className="space-y-2">
            <Label htmlFor="member">
              Member <span className="text-destructive">*</span>
            </Label>
            <Select value={form.memberId} onValueChange={(v) => set("memberId", v)}>
              <SelectTrigger id="member">
                <SelectValue placeholder="Select member" />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.firstName} {m.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Event */}
          <div className="space-y-2">
            <Label htmlFor="event">
              Event <span className="text-destructive">*</span>
            </Label>
            <Select
              value={form.eventId}
              onValueChange={(v) => {
                set("eventId", v)
                set("committeeId", "")
                set("preferredRoleId", "")
                set("assignedRoleId", "")
              }}
            >
              <SelectTrigger id="event">
                <SelectValue placeholder="Select event" />
              </SelectTrigger>
              <SelectContent>
                {events.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Committee (cascades from event) */}
          {form.eventId && (
            <div className="space-y-2">
              <Label htmlFor="committee">
                Committee <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.committeeId}
                onValueChange={(v) => {
                  set("committeeId", v)
                  set("preferredRoleId", "")
                  set("assignedRoleId", "")
                }}
              >
                <SelectTrigger id="committee">
                  <SelectValue placeholder="Select committee" />
                </SelectTrigger>
                <SelectContent>
                  {eventCommittees.length === 0 ? (
                    <SelectItem value="none" disabled>
                      No committees — add them in event settings
                    </SelectItem>
                  ) : (
                    eventCommittees.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Preferred role (cascades from committee) */}
          {form.committeeId && (
            <div className="space-y-2">
              <Label htmlFor="preferredRole">
                Preferred Role <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.preferredRoleId}
                onValueChange={(v) => set("preferredRoleId", v)}
              >
                <SelectTrigger id="preferredRole">
                  <SelectValue placeholder="Select preferred role" />
                </SelectTrigger>
                <SelectContent>
                  {committeeRoles.length === 0 ? (
                    <SelectItem value="none" disabled>
                      No roles — add them in event settings
                    </SelectItem>
                  ) : (
                    committeeRoles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Assigned role (edit mode only) */}
          {isEdit && form.committeeId && (
            <div className="space-y-2">
              <Label htmlFor="assignedRole">Assigned Role</Label>
              <Select
                value={form.assignedRoleId || "none"}
                onValueChange={(v) => set("assignedRoleId", v === "none" ? "" : v)}
              >
                <SelectTrigger id="assignedRole">
                  <SelectValue placeholder="Not yet assigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not yet assigned</SelectItem>
                  {committeeRoles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Status (edit mode only) */}
          {isEdit && (
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={form.status || "Pending"}
                onValueChange={(v) =>
                  set("status", v as "Pending" | "Confirmed" | "Rejected")
                }
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Confirmed">Confirmed</SelectItem>
                  <SelectItem value="Rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Any additional notes…"
              rows={3}
            />
          </div>
        </form>

        {/* Leader approval section (edit mode) */}
        {isEdit && (
          <div className="max-w-2xl rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Leader Approval</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Share this link with the volunteer&apos;s Small Group leader to request
                  approval.
                </p>
              </div>
              <Badge variant={STATUS_VARIANT[volunteer!.status]}>{volunteer!.status}</Badge>
            </div>

            {approvalUrl && (
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-muted px-3 py-2 text-xs">
                  {approvalUrl}
                </code>
                <Button type="button" variant="outline" size="sm" onClick={copyApprovalLink}>
                  <IconCopy className="size-4" />
                  Copy link
                </Button>
              </div>
            )}

            {volunteer?.leaderNotes && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Leader&apos;s notes</p>
                <p className="text-sm">{volunteer.leaderNotes}</p>
              </div>
            )}
          </div>
        )}

        <MobileFormActions
          formId="volunteer-form"
          isEdit={isEdit}
          saving={saving}
          saveLabel={isEdit ? "Save changes" : "Add volunteer"}
          onRevert={handleRevert}
          onDelete={isEdit ? () => setDeleteOpen(true) : undefined}
        />

        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete volunteer</DialogTitle>
              <DialogDescription>
                Are you sure you want to remove{" "}
                <span className="font-medium">{volunteer?.memberName}</span> as a volunteer?
                This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteOpen(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? "Deleting…" : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }
  ```

- [ ] **Step 2: Replace `app/(dashboard)/volunteers/[id]/page.tsx`**

  Remove ministry data fetching:

  ```typescript
  import { notFound } from "next/navigation"
  import { db } from "@/lib/db"
  import { VolunteerForm } from "../volunteer-form"

  async function getData(id: string) {
    const [volunteer, members, events] = await Promise.all([
      db.volunteer.findUnique({
        where: { id },
        include: {
          member: { select: { firstName: true, lastName: true } },
          event: { select: { name: true } },
          committee: { select: { name: true } },
          preferredRole: { select: { name: true } },
          assignedRole: { select: { name: true } },
        },
      }),
      db.member.findMany({
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
        select: { id: true, firstName: true, lastName: true },
      }),
      db.event.findMany({
        orderBy: { startDate: "desc" },
        select: {
          id: true,
          name: true,
          committees: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              name: true,
              roles: {
                orderBy: { createdAt: "asc" },
                select: { id: true, name: true },
              },
            },
          },
        },
      }),
    ])
    return { volunteer, members, events }
  }

  export default async function EditVolunteerPage({
    params,
  }: {
    params: Promise<{ id: string }>
  }) {
    const { id } = await params
    const { volunteer, members, events } = await getData(id)

    if (!volunteer) notFound()

    const volunteerProp = {
      id: volunteer.id,
      memberName: `${volunteer.member.firstName} ${volunteer.member.lastName}`,
      eventName: volunteer.event.name,
      committee: volunteer.committee.name,
      preferredRole: volunteer.preferredRole.name,
      assignedRole: volunteer.assignedRole?.name ?? null,
      status: volunteer.status as "Pending" | "Confirmed" | "Rejected",
      memberId: volunteer.memberId,
      eventId: volunteer.eventId,
      committeeId: volunteer.committeeId,
      preferredRoleId: volunteer.preferredRoleId,
      assignedRoleId: volunteer.assignedRoleId,
      notes: volunteer.notes,
      leaderApprovalToken: volunteer.leaderApprovalToken,
      leaderNotes: volunteer.leaderNotes,
    }

    return <VolunteerForm members={members} events={events} volunteer={volunteerProp} />
  }
  ```

- [ ] **Step 3: Delete the new-volunteer route**

  ```bash
  rm app/(dashboard)/volunteers/new/page.tsx
  ```

  If the directory is now empty, remove it:
  ```bash
  rmdir app/(dashboard)/volunteers/new 2>/dev/null || true
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add app/(dashboard)/volunteers/volunteer-form.tsx app/(dashboard)/volunteers/[id]/page.tsx
  git rm app/(dashboard)/volunteers/new/page.tsx
  git commit -m "feat: update volunteer form to event-only, remove new-volunteer route"
  ```

---

## Task 6: Rewrite top-level volunteers page — types and columns

**Files:**
- Modify: `app/(dashboard)/volunteers/columns.tsx`

- [ ] **Step 1: Replace `app/(dashboard)/volunteers/columns.tsx`**

  Define the new `MemberVolunteerRow` / `VolunteerRecord` types and the `RowActions` for sub-rows.

  ```typescript
  "use client"

  import * as React from "react"
  import { useRouter } from "next/navigation"
  import { IconDots, IconPencil, IconTrash } from "@tabler/icons-react"
  import { toast } from "sonner"

  import { Button } from "@/components/ui/button"
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from "@/components/ui/dialog"
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from "@/components/ui/dropdown-menu"
  import { deleteVolunteer } from "./actions"

  export type VolunteerRecord = {
    id: string
    eventId: string
    eventName: string
    committee: string
    preferredRole: string
    assignedRole: string | null
    status: "Pending" | "Confirmed" | "Rejected"
  }

  export type MemberVolunteerRow = {
    memberId: string
    memberName: string
    totalEvents: number
    aggregatedStatus: "Pending" | "Confirmed" | "Rejected"
    records: VolunteerRecord[]
  }

  export function RowActions({
    volunteerId,
    memberName,
  }: {
    volunteerId: string
    memberName: string
  }) {
    const router = useRouter()
    const [deleteOpen, setDeleteOpen] = React.useState(false)
    const [deleting, setDeleting] = React.useState(false)

    async function handleDelete() {
      setDeleting(true)
      const result = await deleteVolunteer(volunteerId)
      setDeleting(false)
      if (result.success) {
        toast.success("Volunteer record deleted")
        setDeleteOpen(false)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    }

    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8">
              <span className="sr-only">Open menu</span>
              <IconDots className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => router.push(`/volunteers/${volunteerId}`)}>
              <IconPencil className="mr-2 size-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => setDeleteOpen(true)}
              className="text-destructive focus:text-destructive"
            >
              <IconTrash className="mr-2 size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete volunteer record</DialogTitle>
              <DialogDescription>
                Remove <span className="font-medium">{memberName}</span> from this event&apos;s
                volunteers? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteOpen(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? "Deleting…" : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    )
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add app/(dashboard)/volunteers/columns.tsx
  git commit -m "feat: update volunteer columns to member-grouped types"
  ```

---

## Task 7: Rewrite volunteers table (expandable rows)

**Files:**
- Modify: `app/(dashboard)/volunteers/volunteers-table.tsx`

- [ ] **Step 1: Replace `app/(dashboard)/volunteers/volunteers-table.tsx`**

  ```typescript
  "use client"

  import * as React from "react"
  import Link from "next/link"
  import { IconChevronDown, IconChevronRight, IconHeart } from "@tabler/icons-react"

  import { Badge } from "@/components/ui/badge"
  import { Button } from "@/components/ui/button"
  import { Card, CardContent } from "@/components/ui/card"
  import { RowActions, type MemberVolunteerRow, type VolunteerRecord } from "./columns"

  const STATUS_VARIANT = {
    Pending: "secondary",
    Confirmed: "default",
    Rejected: "destructive",
  } as const

  function SubTable({
    records,
    memberName,
  }: {
    records: VolunteerRecord[]
    memberName: string
  }) {
    return (
      <tr>
        <td colSpan={4} className="p-0">
          <div className="border-b bg-muted/30">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 pl-12 pr-4 text-left font-medium text-muted-foreground">
                    Event
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                    Committee
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                    Preferred Role
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                    Assigned Role
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 pl-12 pr-4">
                      <Link
                        href={`/event/${r.eventId}/registrants`}
                        className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                      >
                        {r.eventName}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{r.committee}</td>
                    <td className="px-4 py-2">{r.preferredRole}</td>
                    <td className="px-4 py-2">
                      {r.assignedRole ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge>
                    </td>
                    <td className="px-4 py-2">
                      <RowActions volunteerId={r.id} memberName={memberName} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </td>
      </tr>
    )
  }

  function MemberCard({ member }: { member: MemberVolunteerRow }) {
    const [open, setOpen] = React.useState(false)

    return (
      <Card className="py-0">
        <CardContent className="p-4">
          <button
            className="flex w-full items-start justify-between gap-2 text-left"
            onClick={() => setOpen(!open)}
          >
            <div>
              <p className="font-medium">{member.memberName}</p>
              <p className="text-xs text-muted-foreground">
                {member.totalEvents} event{member.totalEvents !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={STATUS_VARIANT[member.aggregatedStatus]}>
                {member.aggregatedStatus}
              </Badge>
              {open ? (
                <IconChevronDown className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <IconChevronRight className="size-4 shrink-0 text-muted-foreground" />
              )}
            </div>
          </button>

          {open && (
            <div className="mt-3 space-y-2 border-t pt-3">
              {member.records.map((r) => (
                <div key={r.id} className="rounded border p-3 text-sm space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={`/event/${r.eventId}/registrants`}
                      className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                    >
                      {r.eventName}
                    </Link>
                    <div className="flex items-center gap-1">
                      <Badge
                        variant={STATUS_VARIANT[r.status]}
                        className="text-xs"
                      >
                        {r.status}
                      </Badge>
                      <RowActions volunteerId={r.id} memberName={member.memberName} />
                    </div>
                  </div>
                  <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                    <span className="text-muted-foreground">Committee</span>
                    <span>{r.committee}</span>
                    <span className="text-muted-foreground">Preferred Role</span>
                    <span>{r.preferredRole}</span>
                    <span className="text-muted-foreground">Assigned Role</span>
                    <span>{r.assignedRole ?? <span className="text-muted-foreground">—</span>}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  export function VolunteersTable({ members }: { members: MemberVolunteerRow[] }) {
    const [expanded, setExpanded] = React.useState<Set<string>>(new Set())

    function toggle(memberId: string) {
      setExpanded((prev) => {
        const next = new Set(prev)
        if (next.has(memberId)) next.delete(memberId)
        else next.add(memberId)
        return next
      })
    }

    const empty = (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
        <IconHeart className="size-8" />
        <p className="text-sm">No volunteers yet</p>
      </div>
    )

    if (members.length === 0) return empty

    return (
      <>
        {/* Mobile */}
        <div className="flex flex-col gap-2 md:hidden">
          {members.map((m) => (
            <MemberCard key={m.memberId} member={m} />
          ))}
        </div>

        {/* Desktop */}
        <div className="hidden overflow-x-auto rounded-lg border md:block">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Member</th>
                <th className="px-4 py-3 text-left font-medium">Events Volunteered</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <React.Fragment key={m.memberId}>
                  <tr
                    className="cursor-pointer border-b hover:bg-muted/50 transition-colors"
                    onClick={() => toggle(m.memberId)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 font-medium">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 shrink-0"
                          tabIndex={-1}
                        >
                          {expanded.has(m.memberId) ? (
                            <IconChevronDown className="size-3" />
                          ) : (
                            <IconChevronRight className="size-3" />
                          )}
                        </Button>
                        <Link
                          href={`/members/${m.memberId}`}
                          className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {m.memberName}
                        </Link>
                      </div>
                    </td>
                    <td className="px-4 py-3">{m.totalEvents}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[m.aggregatedStatus]}>
                        {m.aggregatedStatus}
                      </Badge>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()} />
                  </tr>
                  {expanded.has(m.memberId) && (
                    <SubTable records={m.records} memberName={m.memberName} />
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </>
    )
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add app/(dashboard)/volunteers/volunteers-table.tsx
  git commit -m "feat: rewrite volunteers table as member-grouped expandable rows"
  ```

---

## Task 8: Update volunteers filters

**Files:**
- Modify: `app/(dashboard)/volunteers/volunteers-filters.tsx`

- [ ] **Step 1: Replace `app/(dashboard)/volunteers/volunteers-filters.tsx`**

  Remove the ministry filter select and all `ministryId` references.

  ```typescript
  "use client"

  import { usePathname, useRouter } from "next/navigation"
  import { IconX } from "@tabler/icons-react"
  import { SearchInput } from "@/components/search-input"
  import { Button } from "@/components/ui/button"
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from "@/components/ui/select"

  type VolunteersFiltersProps = {
    events: { id: string; name: string }[]
    search: string
    status: string
    eventId: string
  }

  export function VolunteersFilters({
    events,
    search,
    status,
    eventId,
  }: VolunteersFiltersProps) {
    const router = useRouter()
    const pathname = usePathname()

    const hasFilters = search || status || eventId

    function buildUrl(overrides: Record<string, string>) {
      const params = new URLSearchParams()
      const current = { search, status, eventId, ...overrides }
      if (current.search) params.set("search", current.search)
      if (current.status) params.set("status", current.status)
      if (current.eventId) params.set("eventId", current.eventId)
      const qs = params.toString()
      return qs ? `${pathname}?${qs}` : pathname
    }

    function setFilter(key: string, value: string) {
      router.replace(buildUrl({ [key]: value }))
    }

    return (
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          defaultValue={search}
          placeholder="Search volunteers..."
          onChange={(value) => setFilter("search", value)}
          className="min-w-48"
        />

        <Select
          value={status || "all"}
          onValueChange={(v) => setFilter("status", v === "all" ? "" : v)}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="Pending">Pending</SelectItem>
            <SelectItem value="Confirmed">Confirmed</SelectItem>
            <SelectItem value="Rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={eventId || "all"}
          onValueChange={(v) => setFilter("eventId", v === "all" ? "" : v)}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Event" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Events</SelectItem>
            {events.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => router.replace(pathname)}>
            <IconX className="size-4" />
            Clear
          </Button>
        )}
      </div>
    )
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add app/(dashboard)/volunteers/volunteers-filters.tsx
  git commit -m "feat: remove ministry filter from volunteers page"
  ```

---

## Task 9: Rewrite top-level volunteers page

**Files:**
- Modify: `app/(dashboard)/volunteers/page.tsx`

- [ ] **Step 1: Replace `app/(dashboard)/volunteers/page.tsx`**

  Fetch all volunteers, group by memberId in memory, compute aggregated status per member.

  ```typescript
  import { VolunteerStatus } from "@/app/generated/prisma/client"
  import { db } from "@/lib/db"
  import { type MemberVolunteerRow, type VolunteerRecord } from "./columns"
  import { VolunteersTable } from "./volunteers-table"
  import { VolunteerImportTrigger } from "./volunteer-import-trigger"
  import { VolunteersFilters } from "./volunteers-filters"

  function aggregateStatus(
    records: { status: VolunteerStatus }[]
  ): "Pending" | "Confirmed" | "Rejected" {
    if (records.some((r) => r.status === "Confirmed")) return "Confirmed"
    if (records.some((r) => r.status === "Pending")) return "Pending"
    return "Rejected"
  }

  async function getMemberRows(params: {
    search: string
    status: string
    eventId: string
  }): Promise<MemberVolunteerRow[]> {
    const volunteers = await db.volunteer.findMany({
      where: {
        AND: [
          params.search
            ? {
                OR: [
                  { member: { firstName: { contains: params.search, mode: "insensitive" } } },
                  { member: { lastName: { contains: params.search, mode: "insensitive" } } },
                ],
              }
            : {},
          params.eventId ? { eventId: params.eventId } : {},
        ],
      },
      orderBy: [{ member: { firstName: "asc" } }, { member: { lastName: "asc" } }],
      include: {
        member: { select: { id: true, firstName: true, lastName: true } },
        event: { select: { id: true, name: true } },
        committee: { select: { name: true } },
        preferredRole: { select: { name: true } },
        assignedRole: { select: { name: true } },
      },
    })

    // Group by member
    const byMember = new Map<string, typeof volunteers>()
    for (const v of volunteers) {
      const existing = byMember.get(v.memberId) ?? []
      existing.push(v)
      byMember.set(v.memberId, existing)
    }

    const rows: MemberVolunteerRow[] = []
    for (const [memberId, memberVolunteers] of byMember) {
      const first = memberVolunteers[0]
      const records: VolunteerRecord[] = memberVolunteers.map((v) => ({
        id: v.id,
        eventId: v.event.id,
        eventName: v.event.name,
        committee: v.committee.name,
        preferredRole: v.preferredRole.name,
        assignedRole: v.assignedRole?.name ?? null,
        status: v.status as "Pending" | "Confirmed" | "Rejected",
      }))

      // Apply status filter at the record level
      const filteredRecords = params.status
        ? records.filter((r) => r.status === params.status)
        : records

      if (filteredRecords.length === 0) continue

      rows.push({
        memberId,
        memberName: `${first.member.firstName} ${first.member.lastName}`,
        totalEvents: filteredRecords.length,
        aggregatedStatus: aggregateStatus(
          filteredRecords.map((r) => ({ status: r.status as VolunteerStatus }))
        ),
        records: filteredRecords,
      })
    }

    return rows
  }

  export default async function VolunteersPage({
    searchParams,
  }: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
  }) {
    const params = await searchParams
    const search = (params.search as string) || ""
    const status = (params.status as string) || ""
    const eventId = (params.eventId as string) || ""

    const [members, events] = await Promise.all([
      getMemberRows({ search, status, eventId }),
      db.event.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    ])

    return (
      <div className="flex flex-1 flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Volunteers</h2>
            <p className="text-sm text-muted-foreground">
              Members who have volunteered and their event assignments
            </p>
          </div>
          <VolunteerImportTrigger events={events} />
        </div>

        <VolunteersFilters
          key={`${search}-${status}-${eventId}`}
          events={events}
          search={search}
          status={status}
          eventId={eventId}
        />

        <VolunteersTable members={members} />
      </div>
    )
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add app/(dashboard)/volunteers/page.tsx
  git commit -m "feat: rewrite volunteers page as member-grouped view"
  ```

---

## Task 10: Update event workspace volunteers

**Files:**
- Modify: `app/(dashboard)/events/[id]/volunteers-tab.tsx`
- Modify: `app/(event)/event/[id]/volunteers/page.tsx`
- Create: `app/(event)/event/[id]/volunteers/new/page.tsx`

- [ ] **Step 1: Replace `app/(dashboard)/events/[id]/volunteers-tab.tsx`**

  Remove group/source concept, flat list of event volunteers, update "Add Volunteer" link to event-scoped route.

  ```typescript
  "use client"

  import * as React from "react"
  import Link from "next/link"
  import { useRouter } from "next/navigation"
  import { IconDots, IconHeart, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react"
  import { toast } from "sonner"

  import { Badge } from "@/components/ui/badge"
  import { Button } from "@/components/ui/button"
  import { Card, CardContent } from "@/components/ui/card"
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from "@/components/ui/dialog"
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from "@/components/ui/dropdown-menu"
  import { deleteEventVolunteer } from "./actions"

  export type EventVolunteer = {
    id: string
    status: string
    notes: string | null
    member: { id: string; firstName: string; lastName: string }
    committee: { id: string; name: string }
    preferredRole: { id: string; name: string }
    assignedRole: { id: string; name: string } | null
  }

  const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
    Pending: "secondary",
    Confirmed: "default",
    Rejected: "destructive",
  }

  function VolunteerRowActions({
    volunteer,
    eventId,
  }: {
    volunteer: EventVolunteer
    eventId: string
  }) {
    const router = useRouter()
    const [deleteOpen, setDeleteOpen] = React.useState(false)
    const [deleting, setDeleting] = React.useState(false)

    async function handleDelete() {
      setDeleting(true)
      const result = await deleteEventVolunteer(volunteer.id, eventId)
      setDeleting(false)
      if (result.success) {
        toast.success("Volunteer removed")
        setDeleteOpen(false)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    }

    const memberName = `${volunteer.member.firstName} ${volunteer.member.lastName}`

    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8">
              <span className="sr-only">Open menu</span>
              <IconDots className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => router.push(`/volunteers/${volunteer.id}`)}>
              <IconPencil className="mr-2 size-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => setDeleteOpen(true)}
              className="text-destructive focus:text-destructive"
            >
              <IconTrash className="mr-2 size-4" />
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove volunteer</DialogTitle>
              <DialogDescription>
                Are you sure you want to remove{" "}
                <span className="font-medium">{memberName}</span> as a volunteer? This action
                cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? "Removing…" : "Remove"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  function VolunteerCard({
    volunteer,
    eventId,
  }: {
    volunteer: EventVolunteer
    eventId: string
  }) {
    const router = useRouter()
    const memberName = `${volunteer.member.firstName} ${volunteer.member.lastName}`
    const statusVariant = STATUS_VARIANT[volunteer.status] ?? "secondary"

    return (
      <Card
        className="cursor-pointer hover:bg-muted/50 transition-colors py-0"
        onClick={() => router.push(`/volunteers/${volunteer.id}`)}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium leading-tight">{memberName}</p>
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <Badge variant={statusVariant}>{volunteer.status}</Badge>
              <VolunteerRowActions volunteer={volunteer} eventId={eventId} />
            </div>
          </div>
          <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
            <span className="text-muted-foreground">Committee</span>
            <span>{volunteer.committee.name}</span>
            <span className="text-muted-foreground">Preferred Role</span>
            <span>{volunteer.preferredRole.name}</span>
            <span className="text-muted-foreground">Assigned Role</span>
            <span>
              {volunteer.assignedRole?.name ?? (
                <span className="text-muted-foreground">—</span>
              )}
            </span>
          </div>
        </CardContent>
      </Card>
    )
  }

  function VolunteersDesktopTable({
    volunteers,
    eventId,
  }: {
    volunteers: EventVolunteer[]
    eventId: string
  }) {
    return (
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Member</th>
              <th className="px-4 py-3 text-left font-medium">Committee</th>
              <th className="px-4 py-3 text-left font-medium">Preferred Role</th>
              <th className="px-4 py-3 text-left font-medium">Assigned Role</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {volunteers.map((v) => {
              const memberName = `${v.member.firstName} ${v.member.lastName}`
              const statusVariant = STATUS_VARIANT[v.status] ?? "secondary"
              return (
                <tr key={v.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/volunteers/${v.id}`}
                      className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                    >
                      {memberName}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{v.committee.name}</td>
                  <td className="px-4 py-3">{v.preferredRole.name}</td>
                  <td className="px-4 py-3">
                    {v.assignedRole?.name ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant}>{v.status}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <VolunteerRowActions volunteer={v} eventId={eventId} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  export function VolunteersTab({
    volunteers,
    eventId,
  }: {
    volunteers: EventVolunteer[]
    eventId: string
  }) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex justify-end">
          <Button size="sm" asChild>
            <Link href={`/event/${eventId}/volunteers/new`}>
              <IconPlus className="mr-2 size-4" />
              Add Volunteer
            </Link>
          </Button>
        </div>

        {volunteers.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
            <IconHeart className="size-8" />
            <p className="text-sm">No volunteers yet</p>
          </div>
        ) : (
          <>
            {/* Mobile */}
            <div className="flex flex-col gap-2 md:hidden">
              {volunteers.map((v) => (
                <VolunteerCard key={v.id} volunteer={v} eventId={eventId} />
              ))}
            </div>
            {/* Desktop */}
            <div className="hidden md:block">
              <VolunteersDesktopTable volunteers={volunteers} eventId={eventId} />
            </div>
          </>
        )}
      </div>
    )
  }
  ```

- [ ] **Step 2: Update `app/(event)/event/[id]/volunteers/page.tsx`**

  Remove ministry grouping — query only event's direct volunteers.

  ```typescript
  import { notFound } from "next/navigation"
  import { db } from "@/lib/db"
  import { VolunteersTab, type EventVolunteer } from "@/app/(dashboard)/events/[id]/volunteers-tab"
  import { VolunteerImportButton } from "./volunteer-import-button"

  async function getEventVolunteers(id: string) {
    return db.event.findUnique({
      where: { id },
      select: {
        id: true,
        volunteers: {
          orderBy: { createdAt: "asc" as const },
          include: {
            member: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                ledGroups: {
                  select: {
                    id: true,
                    name: true,
                    lifeStageId: true,
                    genderFocus: true,
                    language: true,
                    ageRangeMin: true,
                    ageRangeMax: true,
                    meetingFormat: true,
                    locationCity: true,
                  },
                },
              },
            },
            committee: { select: { id: true, name: true } },
            preferredRole: { select: { id: true, name: true } },
            assignedRole: { select: { id: true, name: true } },
          },
        },
      },
    })
  }

  export default async function VolunteersPage({
    params,
  }: {
    params: Promise<{ id: string }>
  }) {
    const { id } = await params
    const event = await getEventVolunteers(id)
    if (!event) notFound()

    const volunteers: EventVolunteer[] = event.volunteers.map((v) => ({
      id: v.id,
      status: v.status,
      notes: v.notes,
      member: v.member,
      committee: v.committee,
      preferredRole: v.preferredRole,
      assignedRole: v.assignedRole,
    }))

    return (
      <div className="flex flex-1 flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Volunteers</h2>
          <div className="flex items-center gap-3">
            {volunteers.length > 0 && (
              <span className="text-sm text-muted-foreground">
                {volunteers.length} total
              </span>
            )}
            <VolunteerImportButton eventId={event.id} />
          </div>
        </div>
        <VolunteersTab volunteers={volunteers} eventId={event.id} />
      </div>
    )
  }
  ```

- [ ] **Step 3: Create `app/(event)/event/[id]/volunteers/new/page.tsx`**

  New page for adding a volunteer directly within an event workspace. Passes only the current event to the form so it's pre-selected.

  ```typescript
  import { notFound } from "next/navigation"
  import { db } from "@/lib/db"
  import { VolunteerForm } from "@/app/(dashboard)/volunteers/volunteer-form"

  async function getData(eventId: string) {
    const [event, members] = await Promise.all([
      db.event.findUnique({
        where: { id: eventId },
        select: {
          id: true,
          name: true,
          committees: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              name: true,
              roles: {
                orderBy: { createdAt: "asc" },
                select: { id: true, name: true },
              },
            },
          },
        },
      }),
      db.member.findMany({
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
        select: { id: true, firstName: true, lastName: true },
      }),
    ])
    return { event, members }
  }

  export default async function NewEventVolunteerPage({
    params,
  }: {
    params: Promise<{ id: string }>
  }) {
    const { id } = await params
    const { event, members } = await getData(id)
    if (!event) notFound()

    return <VolunteerForm members={members} events={[event]} />
  }
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add "app/(dashboard)/events/[id]/volunteers-tab.tsx" \
          "app/(event)/event/[id]/volunteers/page.tsx" \
          "app/(event)/event/[id]/volunteers/new/page.tsx"
  git commit -m "feat: simplify event workspace volunteers, add event-scoped new-volunteer page"
  ```

---

## Task 11: Repurpose ministry volunteer sign-up page

**Files:**
- Modify: `app/ministries/[id]/volunteer/page.tsx`

- [ ] **Step 1: Replace `app/ministries/[id]/volunteer/page.tsx`**

  Show the ministry's upcoming events with links to their event volunteer sign-up pages instead of a sign-up form.

  ```typescript
  import Link from "next/link"
  import { notFound } from "next/navigation"
  import { format } from "date-fns"
  import { db } from "@/lib/db"

  async function getData(ministryId: string) {
    const [ministry, upcomingEvents] = await Promise.all([
      db.ministry.findUnique({
        where: { id: ministryId },
        select: { id: true, name: true },
      }),
      db.event.findMany({
        where: {
          ministries: { some: { ministryId } },
          startDate: { gte: new Date() },
        },
        orderBy: { startDate: "asc" },
        select: { id: true, name: true, startDate: true },
      }),
    ])
    return { ministry, upcomingEvents }
  }

  export default async function MinistryVolunteerPage({
    params,
  }: {
    params: Promise<{ id: string }>
  }) {
    const { id } = await params
    const { ministry, upcomingEvents } = await getData(id)
    if (!ministry) notFound()

    return (
      <div className="flex min-h-screen flex-col items-center justify-start bg-background px-4 py-12">
        <div className="w-full max-w-md space-y-6">
          <div className="space-y-1 text-center">
            <h1 className="text-2xl font-semibold">{ministry.name}</h1>
            <p className="text-muted-foreground text-sm">
              Select an upcoming event to volunteer for.
            </p>
          </div>

          {upcomingEvents.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No upcoming events for this ministry at the moment.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {upcomingEvents.map((event) => (
                <Link
                  key={event.id}
                  href={`/events/${event.id}/volunteer`}
                  className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <p className="font-medium">{event.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(event.startDate), "MMMM d, yyyy")}
                    </p>
                  </div>
                  <span className="text-sm text-muted-foreground">Volunteer →</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add "app/ministries/[id]/volunteer/page.tsx"
  git commit -m "feat: repurpose ministry volunteer page to show upcoming events"
  ```

---

## Task 12: Add copy volunteer link to ministry table, remove volunteer count

**Files:**
- Modify: `app/(dashboard)/ministries/columns.tsx`
- Modify: `app/(dashboard)/ministries/ministries-table.tsx`
- Modify: `app/(dashboard)/ministries/page.tsx`

- [ ] **Step 1: Update `app/(dashboard)/ministries/columns.tsx`**

  Remove `volunteerCount` from `MinistryRow`, add copy-link action to `RowActions` dropdown, remove Volunteers column from `buildColumns`.

  ```typescript
  "use client"

  import * as React from "react"
  import { useRouter } from "next/navigation"
  import { type ColumnDef } from "@tanstack/react-table"
  import { IconCopy, IconDots, IconPencil, IconTrash } from "@tabler/icons-react"
  import { toast } from "sonner"

  import { Button } from "@/components/ui/button"
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from "@/components/ui/dialog"
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from "@/components/ui/dropdown-menu"
  import Link from "next/link"
  import { deleteMinistry } from "./actions"

  export type MinistryRow = {
    id: string
    name: string
    lifeStage: string | null
    description: string | null
    eventCount: number
    lifeStageId: string | null
  }

  export function RowActions({ row }: { row: MinistryRow }) {
    const router = useRouter()
    const [deleteOpen, setDeleteOpen] = React.useState(false)
    const [deleting, setDeleting] = React.useState(false)

    async function handleDelete() {
      setDeleting(true)
      const result = await deleteMinistry(row.id)
      setDeleting(false)
      if (result.success) {
        toast.success("Ministry deleted")
        setDeleteOpen(false)
      } else {
        toast.error(result.error)
      }
    }

    async function copyVolunteerLink() {
      const url = `${window.location.origin}/ministries/${row.id}/volunteer`
      await navigator.clipboard.writeText(url)
      toast.success("Volunteer link copied")
    }

    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8">
              <span className="sr-only">Open menu</span>
              <IconDots className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => router.push(`/ministries/${row.id}`)}>
              <IconPencil className="mr-2 size-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={copyVolunteerLink}>
              <IconCopy className="mr-2 size-4" />
              Copy volunteer link
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => setDeleteOpen(true)}
              className="text-destructive focus:text-destructive"
            >
              <IconTrash className="mr-2 size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete ministry</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete{" "}
                <span className="font-medium">{row.name}</span>? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteOpen(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? "Deleting…" : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  export function buildColumns(): ColumnDef<MinistryRow>[] {
    return [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <Link
            href={`/ministries/${row.original.id}`}
            className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: "lifeStage",
        header: "Life Stage",
        cell: ({ row }) =>
          row.original.lifeStage ?? <span className="text-muted-foreground">—</span>,
      },
      {
        accessorKey: "description",
        header: "Description",
        cell: ({ row }) =>
          row.original.description ?? <span className="text-muted-foreground">—</span>,
      },
      {
        accessorKey: "eventCount",
        header: "Events",
      },
      {
        id: "actions",
        cell: ({ row }) => <RowActions row={row.original} />,
      },
    ]
  }
  ```

- [ ] **Step 2: Update `app/(dashboard)/ministries/ministries-table.tsx`**

  Remove `volunteerCount` from the mobile card display.

  In the `MinistryCard` component, remove these lines from the grid:
  ```diff
  -          <span className="text-muted-foreground">Volunteers</span>
  -          <span>{ministry.volunteerCount}</span>
  ```

- [ ] **Step 3: Update `app/(dashboard)/ministries/page.tsx`**

  Remove `volunteers` from `_count` in the Prisma query and from `MinistryRow` mapping.

  Change the `getMinistries` function query:
  ```typescript
  async function getMinistries(where: Prisma.MinistryWhereInput): Promise<MinistryRow[]> {
    const ministries = await db.ministry.findMany({
      where,
      orderBy: { name: "asc" },
      include: {
        lifeStage: { select: { id: true, name: true } },
        _count: {
          select: {
            events: true,
          },
        },
      },
    })

    return ministries.map((m) => ({
      id: m.id,
      name: m.name,
      lifeStage: m.lifeStage?.name ?? null,
      lifeStageId: m.lifeStageId ?? null,
      description: m.description ?? null,
      eventCount: m._count.events,
    }))
  }
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add "app/(dashboard)/ministries/columns.tsx" \
          "app/(dashboard)/ministries/ministries-table.tsx" \
          "app/(dashboard)/ministries/page.tsx"
  git commit -m "feat: add copy volunteer link to ministry table, remove volunteer count"
  ```

---

## Task 13: Final TypeScript check and cleanup

**Files:** All modified files

- [ ] **Step 1: Run TypeScript check**

  ```bash
  pnpm tsc --noEmit 2>&1
  ```

  Expected: zero errors. If any remain, they will point to missed references to `ministryId`, `scopeType`, `ministry`, or `VolunteerGroup`. Fix each one by removing or updating the reference.

- [ ] **Step 2: Check for any remaining ministry-scope references in volunteer code**

  ```bash
  grep -r "ministryId\|scopeType\|affiliatedMinistries" \
    app/(dashboard)/volunteers/ \
    app/(event)/event/ \
    app/volunteers/ \
    lib/validations/volunteer.ts
  ```

  Expected: no matches. If any exist, trace them and remove.

- [ ] **Step 3: Run dev server and manually verify**

  ```bash
  pnpm dev
  ```

  Check:
  - `/volunteers` — shows member-grouped table, expandable rows show event records
  - `/volunteers/[id]` — edit form shows event picker (no ministry/scope fields)
  - `/event/[id]/volunteers` — flat list of volunteers, no ministry grouping
  - `/event/[id]/volunteers/new` — form pre-locked to event
  - `/ministries` — dropdown has "Copy volunteer link" option, no Volunteers count column
  - `/ministries/[id]/volunteer` — shows upcoming event cards (not a sign-up form)

- [ ] **Step 4: Commit**

  ```bash
  git add -A
  git commit -m "chore: fix any remaining TypeScript cleanup after volunteers refactor"
  ```
