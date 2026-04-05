# Churchie — Project Reference

## What This Is
**Churchie** is a church management web application for administrators. It covers five core domains:
- **Members** — person records of church members
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

---

## Domain Model

### Member
Core person record created when someone joins the church.

**Fields:** `id`, `firstName`, `lastName`, `email`, `phone`, `address`, `dateJoined`, `notes`, `createdAt`, `updatedAt`

**Relationships:**
- Can lead one or more SmallGroups (`SmallGroup.leaderId`)
- Belongs to **at most one** SmallGroup at a time (`Member.smallGroupId` direct FK)
- Has a `smallGroupStatus (SmallGroupStatus nullable)` — tracks integration stage within the group: `New` (trying the group out) → `Regular` (integrated) → `Timothy` (potential leader) → `Leader` (leading their own group). Cleared to null when removed from a group; defaults to `New` when added.
- Can volunteer in multiple ministries (`Volunteer` records)
- Has a `lifeStageId → LifeStage (nullable)` — references the same admin-configurable LifeStage table used by Ministries
- Has `eventRegistrations EventRegistrant[]` — tracks all events the member has registered for; `attendedAt` on each record indicates whether they actually attended

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

### Ministry
A sub-operation within the church targeting a specific life stage (e.g. "Across" = Family Ministry, "Elevate" = Youth Ministry).

**LifeStage fields:** `id`, `name` (e.g. "Family", "Youth", "Young Adults"), `order`
- Life stages are managed by Super Admins in **Settings**

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
  createdAt, updatedAt
}
```

**Business rules:**
- A member submits a volunteer registration form for a Ministry or an Event, selecting a committee and preferred role
- Role selection is a **preference only** — a Ministry Admin reviews and confirms or reassigns via `assignedRoleId`
- Status begins as `Pending` and moves to `Confirmed` or `Rejected` after admin review
- A member can have multiple Volunteer records (different ministries, different events)
- `BreakoutGroup.facilitatorId` still points to a `Volunteer` record (the confirmed volunteer assigned as facilitator)

#### Settings managed by Ministry Admin
- **Ministry Settings** → committees and roles for that ministry's volunteers
- **Event Settings** → committees and roles for that specific event's volunteers

---

### Event
Church events hosted by a ministry. Three event types are supported, each with different behaviour:

| Type | Description | Examples |
|---|---|---|
| **OneTime** | Single-date event, optional registration and payment | Women's monthly meet, special services |
| **MultiDay** | Spans consecutive days, treated like OneTime but displayed as a date range | Retreats, camps |
| **Recurring** | Repeats on a fixed schedule; no pre-registration — walk-in check-in per occurrence | Singles Fridays, Youth Saturdays |

#### Feature applicability by type

| Feature | OneTime | MultiDay | Recurring |
|---|---|---|---|
| Public registration form | ✅ | ✅ | ❌ |
| Payment tracking | ✅ | ✅ | ❌ |
| Breakout groups | ✅ | ✅ | ❌ |
| Baptism module | ✅ | ✅ | ❌ |
| Embarkation module | ✅ | ✅ | ❌ |
| Volunteers | ✅ | ✅ | ✅ |
| Check-in | Per event | Per event | Per occurrence |

**Event fields:** `id`, `name`, `description`, `ministryId → Ministry`, `type EventType @default(OneTime)`, `startDate`, `endDate`, `price (nullable, in cents — null means free)`, `registrationStart`, `registrationEnd`, `createdAt`, `updatedAt`

**Recurring-only fields:** `recurrenceDayOfWeek Int?` (0 = Sunday … 6 = Saturday), `recurrenceFrequency RecurrenceFrequency?` (Weekly | Biweekly | Monthly), `recurrenceEndDate DateTime?` (null = runs indefinitely)

**Event list** is filterable by ministry, type, and date range.

#### Registration & Check-in URLs
Each OneTime/MultiDay event has two public-facing links (no login required):
- **Registration:** `/events/[id]/register` — the public registration form
- **Check-in:** `/events/[id]/checkin` — admin or staff use this to mark attendance on the day

Recurring events have only a check-in URL. The check-in page shows a date picker; selecting a date creates or opens that occurrence's attendee list.

These are separate routes from the admin dashboard event detail page.

**EventRegistrant** — people who register for a OneTime or MultiDay event (member or non-member):
```
id, eventId → Event
memberId         → Member (nullable)
firstName        String (nullable)
lastName         String (nullable)
nickname         String (nullable)
email            String (nullable)
mobileNumber     String (nullable)
isPaid           Boolean (default false)
paymentReference String (nullable — reference number entered by admin when marking paid)
attendedAt       DateTime (nullable — set when attendance is confirmed)
createdAt
```

**No data duplication rule:** `firstName`, `lastName`, and `email` are only populated when `memberId` is null (non-member registrant). When `memberId` is set, all personal data is read from the linked `Member` record — never stored twice. Application layer must enforce this constraint.

`BreakoutGroupMember.registrantId → EventRegistrant` — this single pointer handles both cases cleanly. Existing member data flows through the FK chain: `BreakoutGroupMember → EventRegistrant → Member`.

#### Recurring Event Occurrences

Each physical instance of a recurring event is an `EventOccurrence`. Occurrences are created on-demand (when check-in is opened for a date) or generated in advance by the admin.

```
EventOccurrence {
  id
  eventId   → Event
  date      DateTime   (the specific date of this occurrence)
  notes     String?
  createdAt

  attendees OccurrenceAttendee[]
}

OccurrenceAttendee {
  id
  occurrenceId → EventOccurrence
  memberId     → Member (nullable)
  -- non-member walk-in fields (populated when memberId is null):
  firstName    String?
  lastName     String?
  checkedInAt  DateTime @default(now())

  @@unique([occurrenceId, memberId])  -- prevents duplicate check-ins
}
```

**Admin view for recurring events:** The event detail page shows a list of past occurrences with attendance counts. Clicking an occurrence shows its attendee list.

#### Member Resolution at Registration
When the registration form is submitted, the system runs a lookup against existing Member records by **mobile number (exact match)**.

**If a match is found:** A **"Confirm your details"** screen is shown to the registrant, displaying the matched Member's name, email, and phone. If they confirm it's them, `EventRegistrant.memberId` is set and personal fields are left null. If they say "that's not me", they proceed as a non-member.

**If no match:** The registrant is created as a non-member — personal fields stored on `EventRegistrant`. No Member record is created.

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
  registrantId → EventRegistrant (unique per event — one opt-in per registrant)
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
│   │   ├── small-groups/
│   │   ├── ministries/
│   │   ├── events/
│   │   ├── volunteers/
│   │   └── settings/
│   │       ├── life-stages/      # LifeStage CRUD
│   │       └── matching/         # Matching weight configuration
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
- Every model has `createdAt` (`@default(now())`) and `updatedAt` (`@updatedAt`) managed by Prisma
- Store all datetimes in UTC

### TypeScript
- Strict mode enabled
- Prefer `type` over `interface` for plain data shapes
- Derive types from Prisma-generated types where possible (avoid duplicating schema in types/)
