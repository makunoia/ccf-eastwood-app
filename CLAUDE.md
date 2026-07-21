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

Scoring engine for SmallGroup suggestions and Breakout auto-assignment. Each factor is scored 0.0–1.0 **and flagged `known`** (was it actually measurable, or is 0.5 a placeholder for missing data). Only the six **weighted factors** feed the score; the three **hard gates** are pass/fail eligibility filters applied before scoring.

**Hard eligibility gates** (a group failing any is excluded entirely — never scored, never weighted):

| Gate | Rule |
|---|---|
| Life Stage | 1.0 match; excluded on mismatch; unknown (0.5, no filter) when group sets none or candidate has none |
| Gender | 1.0 match or group is Mixed/none; excluded on mismatch; unknown when candidate gender missing |
| Schedule | Excluded when candidate's availability doesn't overlap the group's meeting time |

**Weighted factors** (0.0–1.0 × weight, normalised over the active-weight total):

| Factor | Scoring logic |
|---|---|
| Language | 1.0 any overlap, 0.0 no overlap; unknown when either side empty |
| Age | 1.0 in range, linear decay over 10 years to 0.0 outside; unknown without birth year or group range |
| Work City | 1.0 same, 0.0 different; unknown when either missing |
| Meeting Preference | 1.0 exact, 0.5 Hybrid↔Online/InPerson, 0.0 incompatible; unknown when either missing |
| Career/Industry | Peer-count ladder: 0→0.25, 1→0.70, 2→0.85, 3+→1.0 (group-size independent); unknown without candidate industry or group roster |
| Capacity | `null` limit → unknown (0.5); else `0.4 + 0.6·min(1, openSlots/3)` — gentle load-balancing (full groups already gate-excluded) |

Each result also carries `breakdown` (all nine sub-scores), `coverage` (per-factor `known` flags), `confidence` (share of active weight backed by measured factors), and `groupSummary` (group-side facts for the UI, with `industryPeerCount` in place of the member roster — safe for the public join page). Results sort by score, then by confidence as a tie-break.

**MatchingWeightConfig:** `{ context (SmallGroup|Breakout), lifeStage, gender, language, age, schedule, location, mode, career, capacity, guestCooldownDays }`. Weights are **normalised at scoring time over the six active factors** (`ACTIVE_WEIGHT_KEYS` in `lib/validations/matching-weights.ts`) — they do NOT need to sum to 1. The three gate columns (`lifeStage`, `gender`, `schedule`) are retained but unweighted (kept at 0); they exist so a gate could be re-promoted to a weighted factor without a schema migration. Configured per context in **Settings → Matching Weights** (six sliders + a read-only "Requirements" section for the gates).

**Code:** `lib/matching/` — `types.ts`, `scorers.ts` (`scoreXDetailed` returns `{score, known}`; plain `scoreX` wrappers), `engine.ts` (pure/no DB — normalisation + confidence + groupSummary), `index.ts` (DB-aware entry points). UI: `components/small-group-match-card.tsx` (`buildFitReasons` → `{strengths, considerations}`, `MatchBreakdown` grid behind `showBreakdown`, admin-only), `components/matching/factor-meta.tsx` (icons/colours/`scoreBand`, client-only).

---

## AI Assistant

SuperAdmin-only chat assistant (floating button, right-side Sheet) mounted in the dashboard and event-workspace layouts. Built on the Vercel AI SDK (`ai` v7) + `@ai-sdk/anthropic` (`ANTHROPIC_API_KEY` required; model constant in `lib/assistant/config.ts`).

- **Server**: `lib/assistant/` — `config.ts` (model + cost caps), `system-prompt.ts`, `serializers.ts` (compact JSON projections; never return raw Prisma rows from a tool), `queries.ts` (read-only helpers, row-capped), `tools.ts` (`buildAssistantTools(session)` — tools close over the session and re-check `canRead`/`canWrite`/`canAccessEvent` per call), `agent.ts` (`ToolLoopAgent` per request). Route: `app/api/assistant/route.ts` (401 unauthenticated / 403 non-SuperAdmin).
- **Writes**: every write tool is listed in `WRITE_TOOL_NAMES` and gated by `toolApproval: 'user-approval'` — the client renders an Approve/Cancel card before execution. Write tools delegate to the existing server actions (which re-run `requireWrite()` + Zod). No delete tools — ever.
- **Client**: `components/assistant/` — panel, message list, per-tool renderers (tables/chart/cards), approval card. Conversation state is in-memory only (resets on reload).
- **Adding a tool**: define it in `tools.ts` (zod `inputSchema`, permission check first line of `execute`, serialize via `serializers.ts`); if it writes, add its name to `WRITE_TOOL_NAMES` and a title in `approval-card.tsx`; add a renderer case in `tool-renderers.tsx` + a loading label; ship schema + integration tests like `tests/integration/assistant-tools.test.ts`.

---

## Development Conventions

### Migrations

Prisma generates non-idempotent SQL by default. **Always rewrite generated migration files to be idempotent before committing.** This prevents P3018/P3009 failures when a migration partially runs and is retried.

| Statement | Required rewrite |
|---|---|
| `CREATE TYPE "Foo" AS ENUM (...)` | Wrap in `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;` |
| `ALTER TABLE "T" ADD COLUMN "c" ...` | `ALTER TABLE "T" ADD COLUMN IF NOT EXISTS "c" ...` |
| `CREATE TABLE "T" (...)` | `CREATE TABLE IF NOT EXISTS "T" (...)` |
| `CREATE INDEX "i" ON ...` | `CREATE INDEX IF NOT EXISTS "i" ON ...` |
| `ALTER TABLE "T" ADD CONSTRAINT ...` | Wrap in `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;` |

**Example — enum + column + table + FK:**
```sql
DO $$ BEGIN
  CREATE TYPE "MyStatus" AS ENUM ('Active', 'Inactive');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "MyTable" ADD COLUMN IF NOT EXISTS "status" "MyStatus" NOT NULL DEFAULT 'Active';

CREATE TABLE IF NOT EXISTS "MyLog" (
    "id" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    CONSTRAINT "MyLog_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "MyLog" ADD CONSTRAINT "MyLog_refId_fkey"
    FOREIGN KEY ("refId") REFERENCES "MyTable"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
```

**Workflow:** `prisma migrate dev` (local) → edit SQL → commit → `prisma migrate deploy` (preview/prod). Never run `migrate dev` against shared databases.

**Recovery when a migration fails in prod (P3009/P3018):**
1. `PRISMA_ENV_FILE=.env.preview npx prisma migrate resolve --rolled-back <migration_name>`
2. Fix the migration SQL to be idempotent
3. `PRISMA_ENV_FILE=.env.preview npx prisma migrate deploy`

---

### Data Access
- Prisma client only — no raw SQL except migrations. Import `db` from `@/lib/db`.
- Prisma 7: import `PrismaClient` from `@/app/generated/prisma/client`; `lib/db.ts` uses `PrismaPg` adapter.

### Mutations
- **Next.js Server Actions** for all create/update/delete. No internal REST routes.
- Return type: `{ success: true; data: T } | { success: false; error: string }`

### Validation
- Zod schemas on all form inputs before DB. Co-locate with feature or in `lib/validations/`.

### Mobile number format
- **Every mobile/phone number is stored in the canonical `"+63 XXX XXX XXXX"` format** — no exceptions, across all six domains.
- Before any `db.*.create`/`update` that writes a phone, and before any lookup that matches on `phone`, pass the value through `formatPhilippinePhone` (`@/lib/utils`). It is idempotent (canonical input → same output), so it is safe to apply defensively anywhere.
- This applies to **every entry path**: admin forms, public registration (`registerForEvent`, `join-small-group`), event check-in/walk-ins, and **all CSV imports** (members, guests, volunteers, registrants, sessions, small groups). A raw CSV/user value that skips normalization both stores a malformed number and silently fails exact-match dedup against existing canonical records — creating duplicates.
- Enforce at the Zod layer where possible: the shared `phone` fields in `lib/validations/member.ts` and `lib/validations/guest.ts` use a `nullablePhone` transform; the public-registration schemas (`registrantSchema`, `personalInfoSchema`) and import actions normalize inline. The `PhonePHInput` component already emits canonical on the client, but never rely on the client alone — always normalize server-side too.

### UI
- **Tailwind CSS** for all styling
- **shadcn/ui** for all component primitives (Button, Dialog, Table, Form, etc.)
- Do not hand-roll components that shadcn/ui already provides
- **Phone inputs:** Always use `PhonePHInput` (`components/ui/phone-ph-input.tsx`) for mobile/phone fields — never a plain `<input type="tel">`. Use `OptionalPhonePHInput` when the field is optional.
- **Email inputs:** Always use `OptionalEmailInput` (`components/ui/optional-email-input.tsx`) for email fields when the field is optional. Never a plain `<input type="email">` unless the field is strictly required with no opt-out.
- **Time inputs:** Always use `TimeInput` (`components/ui/time-input.tsx`) for any time-of-day field — never a plain `<input type="time">`. Accepts/emits `HH:MM` 24-hour strings or `""`. Use `variant="inline"` inside match/profile sections (underline style); use the default variant elsewhere (bordered, matches shadcn `Input` height). The component enforces 12-hour display with am/pm toggle and caps hours at 12.
- **Table link columns:** The primary identifier column in every table (name, date, title) must be a `<Link>` with this exact className: `"font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"`. Do not use `hover:underline`, a plain `<Button asChild>`, or any other link style in table identifier columns — this applies everywhere in the app including the Event miniapp (`app/(event)/`).
- **Page headers & actions:** Every list screen header uses `PageHeader` + `PageActions` (`components/page-header.tsx`). Pass the main action as `PageActions`' `primary` prop (a `PageAction`) and any extras as the `actions` array; mount dialogs/import wizards as `children`. `PageActions` enforces the standard automatically — never hand-roll header buttons or pass a bare `<Button>` into `PageHeader`'s `actions` slot:
  - **Max 3 visible buttons** on desktop (1 primary + up to 2 inline secondary); any further secondary actions auto-overflow into the `⋯` menu.
  - **Layout:** inline secondary → `primary` → the `⋯` overflow menu, which is always pinned to the **far right**.
  - **Utility actions** (Import, Export, and similar) must set `overflow: true` on their `PageAction` so they always live inside the `⋯` menu rather than inline.
  - **On mobile** (`<sm`) the primary renders **icon-only** and all secondary actions collapse into the single `⋯` menu (still far right). Always give every `PageAction` an `icon` so the icon-only/overflow states read clearly.
- **Filter controls:** List screens filter via the `FilterBar` drawer (`components/filter-bar.tsx`) with `FilterField`-wrapped controls — never an ad-hoc inline filter row.

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

### Coverage Policy — build forward
**Every implementation ships with its tests in the same change — never deferred.** Coverage only accumulates; it must never regress. For each feature or fix, add the layers that fit the change:

| Layer | What it covers | Where |
|---|---|---|
| **Unit** | Pure logic in isolation — scorers, helpers, validators, formatters | `tests/unit/` |
| **Integration** | Server actions + real DB state, truncate→seed→call→assert | `tests/tickets/` (or `tests/integration/`) |
| **Regression** | A test pinning the exact bug being fixed so it cannot return | with the fix |
| **Edge case** | Boundaries, nulls, empty/duplicate inputs, malformed phones, circular refs | with the feature |
| **End-to-end** | User-facing flows across the browser | Playwright (`pnpm test:e2e`) |

- Treat tests as part of **"done,"** not a follow-up. A PR that touches `app/` or `lib/` should touch `tests/`.
- Not every change needs all five layers — pick the ones that fit, but **explicitly call out any layer you skip and why** rather than silently omitting it. (A copy tweak needs no integration/e2e; a new server action needs at minimum unit + integration + edge case.)
- Gate before merge: `pnpm verify:ticket CCF-NNN` (or `pnpm test:unit`) as you go, then `pnpm qa:gate`.

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
