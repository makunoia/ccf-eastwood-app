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
| **Ministry Admin** | Scoped to assigned ministry's events, volunteers, and data |

No member self-service portal. **Event workspace sidebar:** Super Admins see "← Events" back link; Ministry Admins do not. Controlled by `showBackLink` prop on `EventSidebar` in `app/(event)/[id]/layout.tsx` — currently defaults to `true` for all users pending role implementation.

---

## Domain Model

### Member
Created when a Guest joins a Small Group (auto-promoted) or added directly by admin.

**Fields:** `id`, `firstName`, `lastName`, `email`, `phone`, `address`, `dateJoined`, `notes`, `createdAt`, `updatedAt`

**Matching fields:** `lifeStageId → LifeStage?`, `gender (Male|Female)?`, `language[]`, `birthMonth Int?`, `birthYear Int?`, `workCity?`, `workIndustry?`, `meetingPreference (Online|Hybrid|InPerson)?`, `SchedulePreference[] { dayOfWeek, timeStart, timeEnd }`

**Relationships:**
- Leads one or more `SmallGroup` (`SmallGroup.leaderId`)
- Belongs to **at most one** SmallGroup via `Member.smallGroupId`
- `smallGroupStatusId → SmallGroupStatus?` — auto-assigned to first status (by `order`) on join; cleared on removal
- `lifeStageId → LifeStage?`
- `eventRegistrations EventRegistrant[]`
- `guest Guest?` — set if promoted from a Guest

---

### Guest
Non-member who attended an event. Entry point into the discipleship pipeline. **Every non-member registrant becomes a Guest** regardless of event type.

**Fields:** `id`, `firstName`, `lastName`, `email`, `phone`, `notes`, `createdAt`, `updatedAt`

**Matching fields:** same set as Member (see above, minus address/dateJoined).

**Promotion to Member:** When added to a Small Group → creates `Member` (`dateJoined = today`), sets `Member.smallGroupId` + first `SmallGroupStatus`, sets `Guest.memberId`, updates all `EventRegistrant` records to point to new Member. Guest record is retained for history; promoted guests leave the active guest list.

**Relationships:** `eventRegistrations EventRegistrant[]`, `memberId → Member? (unique)` — null = still active guest.

---

### SmallGroup
Unlimited-depth network of member-led groups. A leader is simultaneously a member of another group (upward accountability).

**Fields:** `id`, `name`, `leaderId → Member`, `parentGroupId → SmallGroup?`, `createdAt`, `updatedAt`

**Matching fields:** `lifeStageId → LifeStage?` (null = accepts all), `genderFocus (Male|Female|Mixed)?`, `language[]`, `ageRangeMin Int?`, `ageRangeMax Int?`, `meetingFormat (Online|Hybrid|InPerson)?`, `locationCity?`, `memberLimit Int?`, `GroupMeetingSchedule[] { dayOfWeek, timeStart, timeEnd }`

**Rules:** One SmallGroup per member at a time. `parentGroupId` links leader's own membership upward. No max depth. Prevent circular refs at app layer.

---

### SmallGroupStatus
Admin-configurable integration stages. **Fields:** `id`, `name`, `order`, `createdAt`, `updatedAt`. Managed in **Settings → Small Group Statuses**.

---

### Ministry
Sub-operation targeting a life stage. **Fields:** `id`, `name`, `lifeStageId → LifeStage`, `description`, `createdAt`, `updatedAt`.

**LifeStage:** `id`, `name`, `order` — managed in **Settings → Life Stages**.

---

### Volunteer (Committee & Role System)

Members serving in a Ministry or Event. Each Ministry/Event has its own independent committees and roles.

**VolunteerCommittee:** `id`, `name`, `ministryId → Ministry?`, `eventId → Event?` — exactly one must be set.

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

**EventOccurrence:** `id`, `eventId`, `date DateTime`, `notes?`, `createdAt`, `updatedAt`, `@@unique([eventId, date])`

**OccurrenceAttendee:** `id`, `occurrenceId`, `registrantId → EventRegistrant`, `checkedInAt`, `@@unique([occurrenceId, registrantId])`

MultiDay: occurrences auto-generated for every day in date range (`ensureMultiDayOccurrences()`). Recurring: occurrences created on-demand when check-in page is opened. Walk-ins auto-create an `EventRegistrant` at check-in time.

#### BreakoutGroup
Sub-groups within an event. Same matching fields as SmallGroup. `id`, `eventId`, `name`, `facilitatorId → Volunteer?`, `lifeStageId?`, `genderFocus?`, `language?`, `ageRangeMin?`, `ageRangeMax?`, `meetingFormat?`, `locationCity?`, `memberLimit?`, `BreakoutGroupSchedule[] { dayOfWeek, timeStart, timeEnd }`, `createdAt`

**BreakoutGroupMember:** `breakoutGroupId`, `registrantId → EventRegistrant`, `assignedAt`

---

## Event Add-on Modules

Toggled per-event in **Event Settings → Modules**. Tracked in `EventModule { id, eventId, type (Baptism|Embarkation), createdAt, @@unique([eventId, type]) }`.

### Baptism
Admin-managed opt-in (not on public form). `BaptismOptIn { id, eventId, registrantId (@unique globally), createdAt }`

### Embarkation
Bus assignments for registrants and volunteers. Bus manifest PDF at `/events/[id]/buses/[busId]/manifest` (print-to-PDF, no external library).

`Bus { id, eventId, name, capacity Int?, direction (ToVenue|FromVenue|Both), createdAt, updatedAt }`

`BusPassenger { id, busId, registrantId?, volunteerId? — exactly one set, createdAt }`

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
- Tailwind CSS for all styling. shadcn/ui for all primitives — do not hand-roll what shadcn provides.
- Error feedback via toast (sonner).

### Deletes
- Hard delete only. Always show confirmation dialog before destructive actions.

### Timestamps
- Entity models: `createdAt @default(now())` + `updatedAt @updatedAt`
- Immutable join/log models (e.g. `OccurrenceAttendee`, `BreakoutGroupMember`, `BaptismOptIn`): `createdAt` only — no `updatedAt`.
- Store all datetimes in UTC.

### TypeScript
- Strict mode. Prefer `type` over `interface` for plain data shapes. Derive types from Prisma where possible.
