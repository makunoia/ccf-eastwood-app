# Churchie — Project Reference

## What This Is
**Churchie** is a church management web application for administrators. It covers six core domains:
- **Members** — person records of church members
- **Guests** — non-members who attend events; the entry point into the pipeline
- **Small Groups** — member-led fellowship groups forming a hierarchical network
- **Ministries** — sub-operations within the church, each targeting a life stage
- **Events** — church events with registration, attendance tracking, and breakout groups
- **Volunteers** — members who serve in one or more ministries

---

## Tech Stack

| Concern | Choice |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| Database | PostgreSQL |
| ORM | Prisma |
| Auth | NextAuth.js (Auth.js v5) |
| Styling | Tailwind CSS |
| UI Components | shadcn/ui |
| Validation | Zod |
| Payments | Manual only (admin marks paid/unpaid — no Stripe yet) |
| Package manager | pnpm |
| Platform | Web only |

---

## User Roles

| Role | Access |
|---|---|
| **Super Admin** | Full access to all data and settings |
| **Ministry Admin** | Scoped to their assigned ministry's events, volunteers, and data |

No member self-service portal at this stage.

**Event workspace sidebar:** Super Admins see a "← Events" back link at the bottom of the event sidebar. Ministry Admins do **not** see this link — they have no access to the global events list. The back-link visibility is controlled by `showBackLink` prop on `EventSidebar`, set in `app/(event)/[id]/layout.tsx` based on the user's role. Role-based access is not yet implemented in the schema — `showBackLink` currently defaults to `true` for all users and should be updated once roles are added.

---

## Domain Model

### Member
Core person record created when a Guest joins a Small Group (auto-promoted) or when added directly by an admin.

**Fields:** `id`, `firstName`, `lastName`, `email`, `phone`, `address`, `dateJoined`, `notes`, `createdAt`, `updatedAt`

**Relationships:**
- Can lead one or more SmallGroups (`SmallGroup.leaderId`)
- Belongs to **at most one** SmallGroup at a time (`Member.smallGroupId` direct FK)
- Has a `smallGroupStatusId → SmallGroupStatus (nullable)` — tracks integration stage within the group. References the admin-configurable `SmallGroupStatus` table (managed in **Settings → Small Group Statuses**). Defaults to the first status by `order` when added. Cleared to null when removed from a group.
- Can volunteer in multiple ministries (`Volunteer` records)
- Has a `lifeStageId → LifeStage (nullable)` — references the same admin-configurable LifeStage table used by Ministries
- Has `eventRegistrations EventRegistrant[]` — tracks all events the member has registered for; `attendedAt` on each record indicates whether they actually attended
- Has `guest Guest?` — back-relation; set if this Member was promoted from a Guest record

---

### Guest
A person who has attended one or more church events but has not yet joined a Small Group. Guests are the entry point into the discipleship pipeline.

**Every non-member registrant becomes a Guest** — regardless of event type. When someone registers or checks in to an event and cannot be matched to an existing Member, a Guest record is created (or found by mobile number) and linked to their `EventRegistrant`.

**Fields:** `id`, `firstName`, `lastName`, `email`, `phone`, `notes`, `createdAt`, `updatedAt`

**Matching fields** (same set as Member, used for eventual SmallGroup placement): `lifeStageId → LifeStage (nullable)`, `gender`, `language`, `birthDate`, `workCity`, `workIndustry`, `meetingPreference`

**Promotion to Member:**
When a Guest is added to a Small Group, the system automatically:
1. Creates a `Member` record from the Guest's data (`dateJoined = today`)
2. Sets `Member.smallGroupId` and `Member.smallGroupStatusId` to the first `SmallGroupStatus` (by order)
3. Sets `Guest.memberId` to the new Member (marks the Guest as promoted)
4. Updates all `EventRegistrant` records linked to this Guest: sets `memberId` to the new Member

After promotion, the Guest record is retained for historical traceability (`Guest.memberId` links to their Member record). Promoted guests no longer appear in the active Guest list.

**Relationships:**
- `eventRegistrations EventRegistrant[]` — all events attended as a guest
- `memberId → Member (nullable, unique)` — set when promoted; null = still an active guest

---

### SmallGroup
Groups of members gathered to grow spiritually. Structured as an **unlimited-depth network**: a member can lead a group and simultaneously be a member of another group, making leaders accountable upward through the hierarchy.

**Fields:** `id`, `name`, `leaderId → Member`, `parentGroupId → SmallGroup (nullable)`, `createdAt`, `updatedAt`

Members belong to a group via a direct FK on Member: `Member.smallGroupId → SmallGroup (nullable)`

**Business rules:**
- `leaderId` — the member who leads this group
- `parentGroupId` — the SmallGroup that this group's leader belongs to as a member; this is how the hierarchy/network is formed
- A member belongs to **at most one** SmallGroup at a time
- A leader is themselves a member of (at most) one other group, forming the upward accountability chain
- There is no max depth — the network can be arbitrarily deep
- Circular references should be prevented at the application layer

---

### SmallGroupStatus
Tracks a member's integration stage within their small group. Statuses are admin-configurable and ordered.

**Fields:** `id`, `name`, `order`, `createdAt`, `updatedAt`
- Managed by Super Admins in **Settings → Small Group Statuses**
- The first status by `order` is auto-assigned when a member joins a group; cleared when removed

---

### Ministry
A sub-operation within the church targeting a specific life stage (e.g. "Across" = Family Ministry, "Elevate" = Youth Ministry).

**LifeStage fields:** `id`, `name` (e.g. "Family", "Youth", "Young Adults"), `order`
- Life stages are managed by Super Admins in **Settings → Life Stages**

**Ministry fields:** `id`, `name`, `lifeStageId → LifeStage`, `description`, `createdAt`, `updatedAt`

---

### Volunteer (Committee & Role System)

Volunteers are members who register to serve in a **Ministry** or an **Event**. Each Ministry and each Event defines its own independent set of committees and roles (managed in their respective settings by the Ministry Admin). A member can hold multiple volunteer records across different ministries and events.

#### VolunteerCommittee
A committee belongs to either a Ministry or an Event — never both. Managed in Ministry Settings or Event Settings.
```
VolunteerCommittee {
  id
  name
  ministryId → Ministry (nullable)
  eventId    → Event    (nullable)
  -- constraint: exactly one of ministryId or eventId must be set
  createdAt, updatedAt
}
```

#### CommitteeRole
Roles available within a committee. Defined by the Ministry Admin.
```
CommitteeRole {
  id
  name
  committeeId → VolunteerCommittee
  createdAt, updatedAt
}
```

#### Volunteer
The registration record linking a member to a Ministry or Event as a volunteer.
```
Volunteer {
  id
  memberId        → Member
  ministryId      → Ministry (nullable)
  eventId         → Event    (nullable)
  -- constraint: exactly one of ministryId or eventId must be set
  committeeId     → VolunteerCommittee
  preferredRoleId → CommitteeRole  (member's stated preference)
  assignedRoleId  → CommitteeRole  (nullable — set by admin after review)
  status          (Pending | Confirmed | Rejected)
  notes
  leaderApprovalToken  String? (unique UUID — auto-generated at sign-up)
  leaderNotes          String? (optional notes submitted by the leader on approve/reject)
  createdAt, updatedAt
}
```

**Business rules:**
- A member submits a volunteer registration form for a Ministry or an Event, selecting a committee and preferred role
- Role selection is a **preference only** — a Ministry Admin reviews and confirms or reassigns via `assignedRoleId`
- Status begins as `Pending` and moves to `Confirmed` or `Rejected` after admin review
- A member can have multiple Volunteer records (different ministries, different events)
- `BreakoutGroup.facilitatorId` still points to a `Volunteer` record (the confirmed volunteer assigned as facilitator)

**Leader approval flow:**
1. On sign-up, `leaderApprovalToken` (UUID) is auto-generated and stored
2. Admin copies `/volunteer-approval/[token]` from the volunteer detail page and sends it to the member's Small Group leader (WhatsApp, email, etc.)
3. Leader opens the link (no login required) → sees volunteer details → submits Approve or Reject + optional `leaderNotes`
4. Approval sets `status = Confirmed` automatically; rejection sets `status = Rejected`
5. Admin can always manually override status from the volunteer detail page

#### Settings managed by Ministry Admin
- **Ministry Settings** → committees and roles for that ministry's volunteers
- **Event Settings** → committees and roles for that specific event's volunteers

---

### Event
Church events hosted by a ministry. Three event types are supported, each with different behaviour:

**Event workspace:** Opening an event navigates to `/event/[id]/dashboard` — a dedicated mini-app route group (`app/(event)/`) with its own sidebar (`EventSidebar`), independent of the main app sidebar. The workspace contains:
- `dashboard` — stats, public links, edit/settings shortcuts
- `registrants` — attendee list with payment and attendance tracking
- `sessions` — occurrence list (Recurring & MultiDay only)
- `sessions/[occurrenceId]` — individual session attendee list
- `breakouts` — breakout group assignment
- `volunteers` — event volunteer list
- `baptism` — baptism opt-in tracking (if Baptism module enabled)
- `embarkation` — bus assignment (if Embarkation module enabled)
- `settings` — module toggles, committees, buses

Old URLs (`/events/[id]`, `/events/[id]/settings`, `/events/[id]/occurrences/[occurrenceId]`) redirect to their new counterparts. The app is a PWA (`display: standalone`), so navigation stays within the same window — no `target="_blank"` for event links (bus manifest print route is the only intentional exception).

| Type | Description | Examples |
|---|---|---|
| **OneTime** | Single-date event, optional registration and payment | Women's monthly meet, special services |
| **MultiDay** | Spans consecutive days; per-day attendance tracked via occurrences | Retreats, camps |
| **Recurring** | Repeats on a fixed schedule. First-timers register once; returning attendees check in per occurrence | Singles Fridays, Youth Saturdays |

#### Feature applicability by type

| Feature | OneTime | MultiDay | Recurring |
|---|---|---|---|
| Public registration form | ✅ | ✅ | ✅ (first-timers only, no payment) |
| Payment tracking | ✅ | ✅ | ❌ |
| Breakout groups | ✅ | ✅ | ✅ |
| Baptism module | ✅ | ✅ | ❌ |
| Embarkation module | ✅ | ✅ | ❌ |
| Volunteers | ✅ | ✅ | ✅ |
| Check-in | Per event (sets `attendedAt`) | Per day (`OccurrenceAttendee`) | Per occurrence (`OccurrenceAttendee`) |

**Event fields:** `id`, `name`, `description`, `type EventType @default(OneTime)`, `startDate`, `endDate`, `price (nullable, in cents — null means free)`, `registrationStart`, `registrationEnd`, `createdAt`, `updatedAt`

**Event-Ministry relationship:** Many-to-many via `EventMinistry` join table — an event can belong to multiple ministries. (`ministries EventMinistry[]`)

**Recurring-only fields:** `recurrenceDayOfWeek Int?` (0 = Sunday … 6 = Saturday), `recurrenceFrequency RecurrenceFrequency?` (Weekly | Biweekly | Monthly), `recurrenceEndDate DateTime?` (null = runs indefinitely)

**Event list** is filterable by ministry, type, and date range.

#### Registration & Check-in URLs
All three event types have both a registration and a check-in URL (no login required):
- **Registration:** `/events/[id]/register`
- **Check-in:** `/events/[id]/checkin`

For **OneTime**: registration collects details and optionally payment; check-in sets `EventRegistrant.attendedAt`.

For **MultiDay**: same registration form with optional payment, but check-in is per-day — all occurrences are auto-generated for each day in the date range via `ensureMultiDayOccurrences()`, and check-in creates `OccurrenceAttendee` records per day.

For **Recurring**: registration is for first-timers only (no payment). Once registered, a person has a permanent `EventRegistrant` record for the series. Returning attendees skip the form — they just appear in the check-in list for each occurrence.

These are separate routes from the admin dashboard event detail page.

**EventRegistrant** — one record per person per event series (all event types):
```
id, eventId → Event
memberId         → Member (nullable)
guestId          → Guest  (nullable)
firstName        String (nullable)
lastName         String (nullable)
nickname         String (nullable)
email            String (nullable)
mobileNumber     String (nullable)
isPaid           Boolean (default false)      -- OneTime/MultiDay only
paymentReference String (nullable)            -- OneTime/MultiDay only
attendedAt       DateTime (nullable)          -- OneTime only; null = didn't attend
createdAt

occurrenceAttendances OccurrenceAttendee[]    -- populated for MultiDay and Recurring events
```

**No data duplication rule:** Personal fields (`firstName`, `lastName`, `email`) are only populated when both `memberId` and `guestId` are null (a truly anonymous/one-off registrant). When either FK is set, all personal data is read from the linked `Member` or `Guest` record — never stored twice. Application layer must enforce this constraint.

**Exactly one of:** `memberId`, `guestId`, or personal fields — enforced at the application layer.

`BreakoutGroupMember.registrantId → EventRegistrant` — this single pointer handles all three cases cleanly.

#### MultiDay & Recurring Event Occurrences

Each physical session of a recurring event — or each day of a multi-day event — is an `EventOccurrence`. For **MultiDay** events, occurrences are auto-generated for every day in the date range when the event is saved (`ensureMultiDayOccurrences()`). For **Recurring** events, occurrences are created on-demand when the check-in page is opened for a given date.

```
EventOccurrence {
  id
  eventId   → Event
  date      DateTime   (the specific date of this session)
  notes     String?
  createdAt
  updatedAt

  attendees OccurrenceAttendee[]
  @@unique([eventId, date])
}

OccurrenceAttendee {
  id
  occurrenceId  → EventOccurrence
  registrantId  → EventRegistrant   (always set — walk-ins auto-create an EventRegistrant)
  checkedInAt   DateTime @default(now())

  @@unique([occurrenceId, registrantId])
}
```

**Why `registrantId` (not `memberId`) on `OccurrenceAttendee`:**
Pointing to `EventRegistrant` means the person's details (name, email, member link) are stored once on registration and reused for every occurrence check-in. Walk-ins who haven't pre-registered get an `EventRegistrant` auto-created at check-in time — so after their first visit, they're in the system for all future check-ins.

**Check-in flow (Recurring):**
1. Admin opens `/events/[id]/checkin` — today's date pre-selected; occurrence created/found
2. Page shows the full registered list (`EventRegistrant[]` for this event) with a "checked in / not yet" status for today
3. Admin taps a name → `OccurrenceAttendee` record created
4. "Walk-in" button → mobile lookup → member resolution → `EventRegistrant` created if new → checked in

**Registration flow (Recurring, first-timers):**
Same mobile-lookup multi-step form as OneTime, but with no payment fields. On submission, creates `EventRegistrant`. Does not auto-check them in (they still need to check in on the day).

**Admin view for MultiDay/recurring events:** The event detail page shows a list of occurrences with per-session attendance counts. Clicking an occurrence opens its attendee list.

#### Member Resolution at Registration
When the registration form is submitted, the system runs a lookup against existing Member records by **mobile number (exact match)**.

**If a match is found:** A **"Confirm your details"** screen is shown to the registrant, displaying the matched Member's name, email, and phone. If they confirm it's them, `EventRegistrant.memberId` is set and personal fields are left null. If they say "that's not me", they proceed as a non-member.

**If no match:** A `Guest` record is created (or found by mobile number if they've registered before) and linked via `EventRegistrant.guestId`. Personal fields on `EventRegistrant` are left null — the Guest record is the source of truth. This Guest will appear in the `/guests` dashboard and can eventually be promoted to a Member when they join a Small Group.

This resolution is synchronous, happens during the registration flow, and requires no admin intervention.

#### Payment
Admin manually marks `isPaid = true` on a registrant. When doing so, a **payment reference number** (`paymentReference`) must be entered. This is stored on the `EventRegistrant` record for tracking.

**BreakoutGroup** — sub-groups within an event, each led by a volunteer facilitator. Uses the same matching fields as SmallGroup so the same algorithm and weights apply:
```
id, eventId → Event, name
facilitatorId  → Volunteer (nullable)
lifeStageId    → LifeStage (nullable)
genderFocus    GenderFocus (nullable)
language       String (nullable)
ageRangeMin    Int (nullable)
ageRangeMax    Int (nullable)
meetingFormat  MeetingFormat (nullable)
locationCity   String (nullable)
memberLimit    Int (nullable)
schedules      BreakoutGroupSchedule[] { dayOfWeek, timeStart, timeEnd }
createdAt
```

**BreakoutGroupMember** — assignment of registrants to breakout groups:
```
breakoutGroupId → BreakoutGroup
registrantId    → EventRegistrant
assignedAt
```

---

## Event Add-on Modules

Optional features toggled per-event in **Event Settings → Modules**. When enabled, a new tab appears on the event detail page. Modules are tracked in a single `EventModule` table:

```
EventModule {
  id
  eventId → Event
  type    EventModuleType (Baptism | Embarkation)
  createdAt
  @@unique([eventId, type])
}
```

### Module: Baptism

Tracks registrants who will be baptized at the event. Opt-in is **not** part of the public registration form — it is managed by admin mid-event from the attendees list.

**Admin tab (Baptism):** List of opted-in registrants. Admin manually adds/removes people. Shows count.

```
BaptismOptIn {
  id
  eventId      → Event
  registrantId → EventRegistrant (@unique — one baptism per registrant globally, across all events)
  createdAt
}
```

### Module: Embarkation

Manages bus assignments for people going to the event venue. Applies to both registrants and volunteers.

**Admin tab (Embarkation):**
- Define buses (name, capacity, direction)
- Assign registrants and volunteers to buses
- View per-bus passenger list
- Print PDF manifest per bus

**Bus manifest PDF** — dedicated print route: `/events/[id]/buses/[busId]/manifest`
Rendered as a printable HTML page (`@media print`) with a "Print / Save as PDF" button using browser native print-to-PDF. No external PDF library.

**Bus direction** — `ToVenue` is the default for most events. `FromVenue` and `Both` available when needed.

```
Bus {
  id
  eventId   → Event
  name      String   (e.g. "Bus 1", "Blue Bus")
  capacity  Int?     (null = unlimited)
  direction BusDirection (ToVenue | FromVenue | Both)
  createdAt, updatedAt
}

BusPassenger {
  id
  busId        → Bus
  registrantId → EventRegistrant (nullable)
  volunteerId  → Volunteer       (nullable)
  -- exactly one of registrantId or volunteerId must be set
  createdAt
}
```

**Settings UI (Event Settings → Modules):** Toggle cards — off by default. Embarkation toggle reveals bus management (add/edit buses).



A weighted scoring engine automates SmallGroup suggestions and Breakout Group assignment. The algorithm **assists** — admins always review and confirm the output.

### How It Works
Each candidate (member or event registrant) is scored against every eligible group. Each parameter produces a **0.0–1.0** score, multiplied by its configured weight, summed to a final compatibility score. Groups are returned as a ranked list.

### Parameters & Scoring

| Parameter | Scoring |
|---|---|
| **Life Stage** | 1.0 = member's LifeStage matches group's; 0.5 = group has no LifeStage set (accepts all); 0.0 = mismatch |
| **Gender** | 1.0 = match or group is Mixed; 0.0 = mismatch |
| **Language** | 1.0 = same primary language; 0.0 = no overlap |
| **Age** | 1.0 if within `ageRangeMin–ageRangeMax`; linearly decays to 0.0 outside range |
| **Schedule** | Overlap ratio between candidate's preferred time windows and group's meeting schedule |
| **Work Location (City)** | 1.0 = same city; 0.0 = different (geo-proximity can be added later) |
| **Meeting Preference** | 1.0 = exact match; 0.5 = Hybrid compatible with Online or InPerson; 0.0 = incompatible |
| **Career / Work Industry** | Ratio of existing group members in the same industry |
| **Capacity** | `(memberLimit - currentCount) / memberLimit` — favors groups with more open slots |

### Weight Configuration
- Weights stored in `MatchingWeightConfig` table, one record per context (`SmallGroup` | `Breakout`)
- Configurable by Super Admin at **Settings → Matching Weights**
- Weights must sum to 1.0 — UI enforces this in real time
- Separate weight configs for SmallGroup and Breakout contexts

### Schema Additions

**Member — matching fields:**
`lifeStageId → LifeStage (nullable)` — references the shared admin-configurable LifeStage table, `gender (Male|Female)`, `language`, `birthDate`, `workCity`, `workIndustry`, `meetingPreference (Online|Hybrid|InPerson)`, and a related `SchedulePreference[]` table `{ dayOfWeek, timeStart, timeEnd }`

**SmallGroup — matching fields:**
`lifeStageId → LifeStage (nullable — null means "accepts all life stages")`, `genderFocus (Male|Female|Mixed)`, `language`, `ageRangeMin`, `ageRangeMax`, `meetingFormat (Online|Hybrid|InPerson)`, `locationCity`, `memberLimit`, and a related `GroupMeetingSchedule[]` table `{ dayOfWeek, timeStart, timeEnd }`

**BreakoutGroup — matching fields:**
Same as SmallGroup: `lifeStageId → LifeStage (nullable)`, `genderFocus (nullable)`, `language (nullable)`, `ageRangeMin`, `ageRangeMax`, `meetingFormat (nullable)`, `locationCity (nullable)`, `memberLimit`, and a related `BreakoutGroupSchedule[]` table `{ dayOfWeek, timeStart, timeEnd }`. The same scoring functions and engine are used for both contexts — only the weights differ.

**MatchingWeightConfig:**
`{ context (SmallGroup|Breakout), lifeStage, gender, language, age, schedule, location, mode, career, capacity }` — all floats summing to 1.0

### Code Structure: `lib/matching/`
```
lib/matching/
├── types.ts      # CandidateProfile, GroupProfile, MatchResult, WeightConfig
├── scorers.ts    # Pure scorer per parameter: scoreLifeStage(), scoreAge(), etc.
├── engine.ts     # scoreGroup(candidate, group, weights) → MatchResult  [pure, no DB]
└── index.ts      # matchSmallGroup(memberId), matchBreakout(registrantId, eventId)
```
`engine.ts` is fully pure and unit-testable. `index.ts` loads data from DB, calls the engine, returns sorted results.

### Admin UX

**SmallGroup:** Admin opens a member with no group → clicks "Find Best Match" → sees top 3–5 ranked groups with score breakdown → confirms one → `Member.smallGroupId` updated.

**Breakout:** Admin opens Event → Breakout tab → clicks "Auto-Assign Unassigned" → greedy pass assigns each registrant to highest-scoring group with capacity → admin reviews full table and can override → saves.

---

## Directory Structure

```
churchie/
├── CLAUDE.md
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Login / auth pages
│   ├── (dashboard)/              # Protected admin area
│   │   ├── members/
│   │   ├── guests/
│   │   ├── small-groups/
│   │   ├── ministries/
│   │   ├── events/
│   │   ├── volunteers/
│   │   └── settings/
│   │       ├── life-stages/          # LifeStage CRUD
│   │       ├── small-group-statuses/ # SmallGroupStatus CRUD
│   │       └── matching/             # Matching weight configuration
│   └── api/
│       └── auth/                 # NextAuth.js route handler
├── components/
│   ├── ui/                       # shadcn/ui primitives
│   └── ...                       # Feature-specific components
├── lib/
│   ├── db.ts                     # Prisma client singleton
│   ├── auth.ts                   # NextAuth config and helpers
│   └── matching/
│       ├── types.ts              # CandidateProfile, GroupProfile, MatchResult, WeightConfig
│       ├── scorers.ts            # Pure scorer functions per parameter
│       ├── engine.ts             # scoreGroup() — pure, no DB, unit-testable
│       └── index.ts              # matchSmallGroup(), matchBreakout() — DB-aware entry points
├── prisma/
│   └── schema.prisma
├── types/                        # Shared TypeScript types
└── ...
```

---

## Development Conventions

### Package Manager
- Use **pnpm** exclusively — do not use npm or yarn
- Prisma 7 generates client to `app/generated/prisma/` — import `PrismaClient` from `@/app/generated/prisma/client`
- Prisma 7 uses driver adapters — `lib/db.ts` initialises with `PrismaPg` from `@prisma/adapter-pg`
- `lib/db.ts` exports the singleton Prisma client as `db`

### Data Access
- All database access goes through the Prisma client — no raw SQL except in migrations
- Import `db` from `@/lib/db`

### Mutations
- Use **Next.js Server Actions** for all create/update/delete operations
- No separate REST API routes for internal CRUD (API routes only for NextAuth and any future webhooks)
- Server actions return a typed result: `{ success: true, data } | { success: false, error: string }`

### Validation
- All form inputs validated with **Zod** schemas before hitting the database
- Zod schemas live co-located with the feature or in `lib/validations/`

### UI
- **Tailwind CSS** for all styling
- **shadcn/ui** for all component primitives (Button, Dialog, Table, Form, etc.)
- Do not hand-roll components that shadcn/ui already provides

### Error Handling
- `try/catch` in all server actions
- Never expose raw Prisma/DB errors to the client
- Show user-facing errors via toast notifications (sonner or shadcn/ui toast)

### Deletes
- **Hard delete** only — no soft deletes
- Always show a confirmation dialog before any destructive action

### Timestamps
- Every **entity model** has `createdAt` (`@default(now())`) and `updatedAt` (`@updatedAt`) managed by Prisma
- **Immutable join/log models** (e.g. `OccurrenceAttendee`, `BreakoutGroupMember`, `BusPassenger`, `BaptismOptIn`) have only `createdAt` or a semantically named timestamp (`checkedInAt`, `assignedAt`) — no `updatedAt`, since these records are never mutated after creation
- Store all datetimes in UTC

### TypeScript
- Strict mode enabled
- Prefer `type` over `interface` for plain data shapes
- Derive types from Prisma-generated types where possible (avoid duplicating schema in types/)
