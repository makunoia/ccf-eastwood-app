# Churchie — Project Reference

## What This Is
Church management web app for administrators. Six domains: **Members**, **Guests**, **Small Groups**, **Ministries**, **Events**, **Volunteers**.

---

## Tech Stack

| Concern | Choice |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| Database | PostgreSQL |
| ORM | Prisma 7 (client at `app/generated/prisma/`, driver adapter `PrismaPg`) |
| Auth | NextAuth.js (Auth.js v5) |
| Styling | Tailwind CSS v4 |
| UI Components | shadcn/ui |
| Validation | Zod |
| Package manager | pnpm |

---

## User Roles

| Role | Access |
|---|---|
| **Super Admin** | Full access to all data and settings |
| **Staff** | Scoped access — granted per `FeatureArea` (Members, Guests, SmallGroups, Ministries, Events, Volunteers) and per `UserEventAccess` (specific events) |

No member self-service portal. Staff users see only permitted nav items; Settings is Super Admin only. Access controlled via `UserPermission { userId, feature: FeatureArea }` and `UserEventAccess { userId, eventId }`.

---

## Domain Model

### Member
Created when a Guest joins a Small Group (auto-promoted) or added directly by admin.

**Fields:** `id`, `firstName`, `lastName`, `email`, `phone`, `address`, `dateJoined`, `notes`, `createdAt`, `updatedAt`

**Matching fields:** `lifeStageId → LifeStage?`, `gender (Male|Female)?`, `language[]`, `birthMonth Int?`, `birthYear Int?`, `workCity?`, `workIndustry?`, `meetingPreference (Online|Hybrid|InPerson)?`, `SchedulePreference[] { dayOfWeek, timeStart, timeEnd }`

**Relationships:**
- Leads one or more `SmallGroup` (`SmallGroup.leaderId`)
- Belongs to **at most one** SmallGroup via `Member.smallGroupId`
- `groupStatus MemberGroupStatus? (Member|Timothy|Leader)` — null when not in a group; set on join
- `lifeStageId → LifeStage?`
- `eventRegistrations EventRegistrant[]`
- `guest Guest?` — set if promoted from a Guest

---

### Guest
Non-member who attended an event. Entry point into the discipleship pipeline. **Every non-member registrant becomes a Guest** regardless of event type.

**Fields:** `id`, `firstName`, `lastName`, `email`, `phone`, `notes`, `createdAt`, `updatedAt`

**Matching fields:** same set as Member (see above, minus address/dateJoined).

**Additional fields:** `scheduleDayOfWeek Int?` (0=Sun…6=Sat), `scheduleTimeStart String?` (HH:MM — single schedule slot), `claimedSmallGroupId → SmallGroup?` — self-reported group from check-in prompt.

**Promotion to Member:** When added to a Small Group → creates `Member` (`dateJoined = today`), sets `Member.smallGroupId`, sets `Guest.memberId`, updates all `EventRegistrant` records to point to new Member. Guest record is retained for history; promoted guests leave the active guest list.

**Relationships:** `eventRegistrations EventRegistrant[]`, `memberId → Member? (unique)` — null = still active guest.

---

### SmallGroup
Unlimited-depth network of member-led groups. A leader is simultaneously a member of another group (upward accountability).

**Fields:** `id`, `name`, `leaderId → Member`, `parentGroupId → SmallGroup?`, `createdAt`, `updatedAt`

**Matching fields:** `lifeStageId → LifeStage?` (null = accepts all), `genderFocus (Male|Female|Mixed)?`, `language[]`, `ageRangeMin Int?`, `ageRangeMax Int?`, `meetingFormat (Online|Hybrid|InPerson)?`, `locationCity?`, `memberLimit Int?`, `scheduleDayOfWeek Int?` (0=Sun…6=Sat), `scheduleTimeStart String?` (HH:MM — single meeting slot)

**Other fields:** `leaderConfirmationToken String? (unique)` — public confirmation link token for the group leader.

**Rules:** One SmallGroup per member at a time. `parentGroupId` links leader's own membership upward. No max depth. Prevent circular refs at app layer.

---

### SmallGroupMemberRequest
Tracks pending/confirmed/rejected requests to add a Guest or Member to a SmallGroup (including transfers between groups).

**Fields:** `id`, `smallGroupId → SmallGroup`, `guestId → Guest?`, `memberId → Member?` (exactly one set), `fromGroupId → SmallGroup?` (set on transfers), `status (Pending|Confirmed|Rejected)`, `notes?`, `assignedByUserId → User?`, `breakoutGroupId?` (links to originating breakout — cleared on removal), `resolvedAt?`, `createdAt`

---

### SmallGroupLog
Append-only audit trail for all SmallGroup membership changes.

**Fields:** `id`, `smallGroupId → SmallGroup`, `action (GroupCreated|MemberAdded|MemberRemoved|MemberTransferred|TempAssignmentCreated|TempAssignmentConfirmed|TempAssignmentRejected)`, `memberId?`, `guestId?`, `fromGroupId?`, `toGroupId?`, `performedByUserId?`, `description?`, `createdAt`

---

### Ministry
Sub-operation targeting a life stage. **Fields:** `id`, `name`, `lifeStageId → LifeStage`, `description`, `createdAt`, `updatedAt`.

**LifeStage:** `id`, `name`, `order` — managed in **Settings → Life Stages**.

---

### Volunteer (Committee & Role System)

Members serving in a Ministry or Event. Each Ministry/Event has its own independent committees and roles.

**VolunteerCommittee:** `id`, `name`, `eventId → Event` — scoped to events only (no ministry-level committees).

**CommitteeRole:** `id`, `name`, `committeeId → VolunteerCommittee`.

**Volunteer:** `id`, `memberId → Member`, `ministryId?`, `eventId?` (exactly one set), `committeeId`, `preferredRoleId → CommitteeRole`, `assignedRoleId → CommitteeRole?`, `status (Pending|Confirmed|Rejected)`, `notes?`, `leaderApprovalToken String? (unique UUID)`, `leaderNotes?`, `createdAt`, `updatedAt`.

**Rules:** Role selection is preference only — admin reviews and may reassign via `assignedRoleId`. Member can hold multiple Volunteer records (different ministries/events). `BreakoutGroup.facilitatorId → Volunteer`.

**Leader approval flow:**
1. `leaderApprovalToken` auto-generated on sign-up
2. Admin shares `/volunteer-approval/[token]` with Small Group leader
3. Leader approves/rejects (no login) + optional `leaderNotes` → sets status automatically
4. Admin can always manually override status

---

### Event
Three types with different behavior:

| Type | Description |
|---|---|
| **OneTime** | Single date; optional registration + payment |
| **MultiDay** | Consecutive days; per-day attendance via occurrences |
| **Recurring** | Fixed schedule; first-timers register once; returning attendees check in per occurrence |

**Fields:** `id`, `name`, `description`, `type (OneTime|MultiDay|Recurring)`, `startDate`, `endDate`, `price Int? (cents, null=free)`, `registrationStart?`, `registrationEnd?`, `createdAt`, `updatedAt`

**Recurring-only:** `recurrenceDayOfWeek Int?` (0=Sun…6=Sat), `recurrenceFrequency (Weekly|Biweekly|Monthly)?`, `recurrenceEndDate?` (null = indefinite)

**Event-Ministry:** many-to-many via `EventMinistry` join table.

**Feature matrix:**

| Feature | OneTime | MultiDay | Recurring |
|---|---|---|---|
| Public registration | ✅ | ✅ | ✅ (first-timers, no payment) |
| Payment tracking | ✅ | ✅ | ❌ |
| Breakout groups | ✅ | ✅ | ✅ |
| Baptism module | ✅ | ✅ | ❌ |
| Embarkation module | ✅ | ✅ | ❌ |
| Volunteers | ✅ | ✅ | ✅ |
| Check-in | `attendedAt` on registrant | Per day (`OccurrenceAttendee`) | Per occurrence (`OccurrenceAttendee`) |

**Event workspace** (`/event/[id]/...`): dashboard, registrants, sessions, sessions/[occurrenceId], breakouts, volunteers, baptism, embarkation, settings. Old `/events/[id]` URLs redirect to new workspace routes. PWA — no `target="_blank"` except bus manifest print.

**Public URLs (no login):** `/events/[id]/register`, `/events/[id]/checkin`

#### EventRegistrant
One record per person per event series.

`id`, `eventId`, `memberId?`, `guestId?`, `firstName?`, `lastName?`, `nickname?`, `email?`, `mobileNumber?`, `isPaid Boolean`, `paymentReference?`, `attendedAt?` (OneTime only), `occurrenceAttendances OccurrenceAttendee[]`

**No data duplication:** personal fields only populated when both FKs are null. When either FK is set, data comes from the linked record. Exactly one of: memberId, guestId, or personal fields — app-layer enforced.

#### Member Resolution at Registration
Lookup by mobile number (exact match). **Match found:** show confirm screen — if confirmed, set `memberId`; if not, proceed as non-member. **No match:** create/find `Guest` by mobile, link via `guestId`.

#### Payment
Admin manually marks `isPaid = true` and must enter `paymentReference`. Stored on `EventRegistrant`.

#### MultiDay & Recurring Occurrences

**EventOccurrence:** `id`, `eventId`, `date DateTime`, `notes?`, `isOpen Boolean` (whether check-in is currently open), `createdAt`, `updatedAt`, `@@unique([eventId, date])`

**OccurrenceAttendee:** `id`, `occurrenceId`, `registrantId → EventRegistrant`, `checkedInAt`, `@@unique([occurrenceId, registrantId])`

MultiDay: occurrences auto-generated for every day in date range (`ensureMultiDayOccurrences()`). Recurring: occurrences created on-demand when check-in page is opened. Walk-ins auto-create an `EventRegistrant` at check-in time.

#### BreakoutGroup
Sub-groups within an event. Same matching fields as SmallGroup. `id`, `eventId`, `name`, `facilitatorId → Volunteer?`, `coFacilitatorId → Volunteer?`, `linkedSmallGroupId → SmallGroup?` (temp membership target), `lifeStageId?`, `genderFocus?`, `language?`, `ageRangeMin?`, `ageRangeMax?`, `meetingFormat?`, `locationCity?`, `memberLimit?`, `BreakoutGroupSchedule[] { dayOfWeek, timeStart, timeEnd }`, `createdAt`

**BreakoutGroupMember:** `breakoutGroupId`, `registrantId → EventRegistrant`, `assignedAt`

---

## Event Add-on Modules

Toggled per-event in **Event Settings → Modules**. Tracked in `EventModule { id, eventId, type (Baptism|Embarkation|CatchMech), createdAt, @@unique([eventId, type]) }`.

### Baptism
Admin-managed opt-in (not on public form). `BaptismOptIn { id, eventId, registrantId (@unique globally), createdAt }`

### Embarkation
Bus assignments for registrants and volunteers. Bus manifest PDF at `/events/[id]/buses/[busId]/manifest` (print-to-PDF, no external library).

`Bus { id, eventId, name, capacity Int?, direction (ToVenue|FromVenue|Both), createdAt, updatedAt }`

`BusPassenger { id, busId, registrantId?, volunteerId? — exactly one set, createdAt }`

---

### Catch Mech
Facilitator-led confirmation flow that converts breakout group attendees into SmallGroup member requests.

**How it works:**
1. Admin enables the CatchMech module on an event
2. Public entry at `/events/[id]/catch-mech` — facilitator verifies identity via mobile number, receives a unique token link
3. Facilitator opens their token URL (`/events/[id]/catch-mech/[token]`) — no login; shows their breakout group members with checkboxes to confirm attendance/interest
4. Confirmed members generate `SmallGroupMemberRequest` records targeting the breakout's `linkedSmallGroupId`
5. Admin tracks all requests in the event workspace at `/event/[id]/catch-mech` (filterable by Pending/Confirmed/Rejected status), with per-registrant matching UI

`CatchMechSession { id, token (unique cuid), eventId, breakoutGroupId, facilitatorVolunteerId, createdAt }`

**Event workspace routes:** `/event/[id]/catch-mech`, `/event/[id]/catch-mech/[status]`, `/event/[id]/catch-mech/[status]/[rid]`

**Public routes:** `/events/[id]/catch-mech`, `/events/[id]/catch-mech/[token]` (no login required)

---

## Matching Algorithm

Weighted scoring engine for SmallGroup suggestions and Breakout auto-assignment. Each parameter scores 0.0–1.0, multiplied by its weight, summed to a compatibility score.

| Parameter | Scoring logic |
|---|---|
| Life Stage | 1.0 match, 0.5 group has none set, 0.0 mismatch |
| Gender | 1.0 match or Mixed, 0.0 mismatch |
| Language | 1.0 same primary, 0.0 no overlap |
| Age | 1.0 in range, linear decay to 0.0 outside |
| Schedule | Overlap ratio of time windows |
| Work City | 1.0 same, 0.0 different |
| Meeting Preference | 1.0 exact, 0.5 Hybrid↔Online/InPerson, 0.0 incompatible |
| Career/Industry | Ratio of existing members in same industry |
| Capacity | `(memberLimit - currentCount) / memberLimit` |

**MatchingWeightConfig:** `{ context (SmallGroup|Breakout), lifeStage, gender, language, age, schedule, location, mode, career, capacity }` — all floats summing to 1.0. Configured per context in **Settings → Matching Weights**.

**Code:** `lib/matching/` — `types.ts`, `scorers.ts`, `engine.ts` (pure/no DB), `index.ts` (DB-aware entry points).

---

## Development Conventions

### Data Access
- Prisma client only — no raw SQL except migrations. Import `db` from `@/lib/db`.
- Prisma 7: import `PrismaClient` from `@/app/generated/prisma/client`; `lib/db.ts` uses `PrismaPg` adapter.

### Mutations
- **Next.js Server Actions** for all create/update/delete. No internal REST routes.
- Return type: `{ success: true; data: T } | { success: false; error: string }`

### Validation
- Zod schemas on all form inputs before DB. Co-locate with feature or in `lib/validations/`.

### UI
- **Tailwind CSS** for all styling
- **shadcn/ui** for all component primitives (Button, Dialog, Table, Form, etc.)
- Do not hand-roll components that shadcn/ui already provides
- **Phone inputs:** Always use `PhonePHInput` (`components/ui/phone-ph-input.tsx`) for mobile/phone fields — never a plain `<input type="tel">`. Use `OptionalPhonePHInput` when the field is optional.
- **Email inputs:** Always use `OptionalEmailInput` (`components/ui/optional-email-input.tsx`) for email fields when the field is optional. Never a plain `<input type="email">` unless the field is strictly required with no opt-out.
- **Time inputs:** Always use `TimeInput` (`components/ui/time-input.tsx`) for any time-of-day field — never a plain `<input type="time">`. Accepts/emits `HH:MM` 24-hour strings or `""`. Use `variant="inline"` inside match/profile sections (underline style); use the default variant elsewhere (bordered, matches shadcn `Input` height). The component enforces 12-hour display with am/pm toggle and caps hours at 12.
- **Table link columns:** The primary identifier column in every table (name, date, title) must be a `<Link>` with this exact className: `"font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"`. Do not use `hover:underline`, a plain `<Button asChild>`, or any other link style in table identifier columns — this applies everywhere in the app including the Event miniapp (`app/(event)/`).

### Error Handling
- `try/catch` in all server actions
- Never expose raw Prisma/DB errors to the client
- Show user-facing errors via toast notifications (sonner or shadcn/ui toast)

### Deletes
- Hard delete only. Always show confirmation dialog before destructive actions.

### Timestamps
- Entity models: `createdAt @default(now())` + `updatedAt @updatedAt`
- Immutable join/log models (e.g. `OccurrenceAttendee`, `BreakoutGroupMember`, `BaptismOptIn`): `createdAt` only — no `updatedAt`.
- Store all datetimes in UTC.

### TypeScript
- Strict mode. Prefer `type` over `interface` for plain data shapes. Derive types from Prisma where possible.

---

## Testing

### Setup
- **Test runner:** Vitest (unit + ticket tests), Playwright (e2e)
- **Test database:** local PostgreSQL 16 (`ccf_test`) — separate from staging. Started via `brew services start postgresql@16`.
- **Env:** `.env.test` at project root sets `DATABASE_URL=postgresql://marknoya@localhost/ccf_test`. Vitest loads this automatically via `vitest.config.ts`.
- **`next/cache`** (`revalidatePath`, `revalidateTag`) is globally mocked in `tests/setup.ts` — required for any test that imports a server action.

### Commands

| Command | Purpose |
|---|---|
| `pnpm ticket:test:new CCF-NNN` | Scaffold `tests/tickets/ccf-nnn.test.ts` with unit/integration/regression stubs |
| `pnpm verify:ticket CCF-NNN` | Run just that ticket's test file |
| `pnpm test:tickets` | Run all ticket verification files |
| `pnpm test:unit` | Run unit tests only (`tests/unit/`) |
| `pnpm test` | Run all Vitest tests |
| `pnpm test:e2e` | Run Playwright e2e tests (auto-starts dev server) |
| `pnpm qa:gate` | Full CI gate: lint → vitest → verify:all → build |

### Workflow for a ticket
1. `pnpm ticket:test:new CCF-NNN` — creates the test file with stubs
2. Read the Jira ticket, implement the feature/fix
3. Replace `it.todo` stubs with real assertions
4. `pnpm verify:ticket CCF-NNN` — confirm green
5. `pnpm qa:gate` before merging

### Integration test pattern
Tests that call server actions or touch the DB follow this pattern:

```ts
import { db } from "@/lib/db"
import { myAction } from "@/app/.../actions"

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "TableA", "TableB" RESTART IDENTITY CASCADE`
})
afterAll(async () => {
  await db.$disconnect()
})

it("...", async () => {
  // 1. Seed minimum required data
  const record = await db.someModel.create({ data: { ... } })
  // 2. Call the action
  const result = await myAction(args)
  // 3. Assert DB state
  expect(result.success).toBe(true)
  const updated = await db.someModel.findUnique({ where: { id: record.id } })
  expect(updated?.field).toBe("expected")
})
```

- The test DB is empty between runs — each test seeds its own data.
- `Member.dateJoined` is required — always pass `dateJoined: new Date()` when seeding.
- Truncate all tables touched by the test (use CASCADE freely — it won't drop the schema).
- No shared fixtures. Tests must be fully self-contained.
