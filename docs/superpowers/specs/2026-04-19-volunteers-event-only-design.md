# Volunteers — Event-Only Redesign

**Date:** 2026-04-19
**Status:** Approved

## Overview

Volunteers are decoupled from Ministries and tied solely to Events. The top-level `/volunteers` page becomes a member-centric view showing which members have volunteered and in which events. The ministry volunteer sign-up page is repurposed to list a ministry's upcoming events.

---

## Section 1: Schema & Data Migration

### Migration steps

**Step 1 — Data cleanup (raw SQL in migration file):**
- Delete all `Volunteer` records where `ministryId IS NOT NULL AND eventId IS NULL`
- Delete all `VolunteerCommittee` records where `ministryId IS NOT NULL AND eventId IS NULL`

**Step 2 — Schema changes:**
- `VolunteerCommittee`: drop `ministryId` column, make `eventId` required (non-nullable)
- `Volunteer`: drop `ministryId` column, make `eventId` required (non-nullable)
- Remove `Ministry.committees` and `Ministry.volunteers` back-relations from the Prisma schema

### Unaffected models
- `Ministry` model itself is unchanged (still used for Events, Life Stages, etc.)
- `BreakoutGroup.facilitatorId → Volunteer` — unaffected (already event-scoped)
- `BusPassenger.volunteerId` — unaffected (already event-scoped)
- `CommitteeRole` — no changes needed

---

## Section 2: Top-Level Volunteers Page (`/volunteers`)

### Layout
- One row per **member** who has at least one volunteer record
- Expandable rows: clicking a member reveals a sub-table of their individual volunteer records

### Parent row columns
| Column | Description |
|---|---|
| Member name | Link to member detail page |
| Total events volunteered | Count of distinct events |
| Latest status | Aggregated: Confirmed if any confirmed, else Pending, else Rejected |

### Expanded sub-row columns (per volunteer record)
| Column | Description |
|---|---|
| Event name | Link to event workspace (`/event/[id]`) |
| Committee | Committee name |
| Preferred Role | Role the volunteer requested |
| Assigned Role | Role admin assigned (may be empty) |
| Status | Badge: Pending / Confirmed / Rejected |

### Filters
- **Search**: by member name (filters parent rows)
- **Status filter**: applies to expanded sub-rows (a member row is shown if any of their records match)

### Removed
- Ministry filter/column
- Scope column
- Top-level "Add Volunteer" button — volunteer creation moves to individual event workspaces only

### Data fetching
- Single query: all `Volunteer` records with `member`, `event`, `committee`, `preferredRole`, `assignedRole` — grouped in-memory by `memberId`
- No pagination on parent rows (member count expected to be small)

---

## Section 3: Ministry Volunteer Page & Copy Link Button

### Repurposed `/ministries/[id]/volunteer`

The page no longer shows a sign-up form. Instead it shows the ministry's upcoming events.

**Behavior:**
- Queries events linked to the ministry via `EventMinistry` where `event.startDate >= today`, ordered by `startDate` ascending
- Displays event cards: event name, date, "Volunteer" button → links to `/events/[id]/volunteer`
- Empty state: "No upcoming events for this ministry" if none found
- Remains a **public page** (no auth required)

**Removed:**
- The sign-up form and `submitVolunteerSignUp` server action with `ministryId` context are deleted (dead code once schema drops `ministryId`)

### Copy volunteer link button on Ministries table

- Add a **"Copy volunteer link"** action button per ministry row in the `/ministries` table
- Copies the URL `/ministries/[id]/volunteer` to clipboard using `navigator.clipboard.writeText`
- Shows a toast confirmation on successful copy
- Matches existing copy-to-clipboard patterns in the app

---

## Files to Create / Modify

### Schema & Migration
- `prisma/schema.prisma` — remove `ministryId` from `VolunteerCommittee` and `Volunteer`; make `eventId` required; remove Ministry back-relations
- `prisma/migrations/<timestamp>_volunteers_event_only/migration.sql` — raw SQL delete + ALTER TABLE

### Top-level Volunteers Page
- `app/(dashboard)/volunteers/page.tsx` — rewrite to member-grouped view
- `app/(dashboard)/volunteers/columns.tsx` — new column definitions for parent + sub-row
- `app/(dashboard)/volunteers/new/page.tsx` — **delete** (creation moves to event workspaces only)
- `app/(dashboard)/volunteers/[id]/page.tsx` — keep for editing individual records from the volunteers list
- `app/(dashboard)/volunteers/actions.ts` — remove ministry-scoped logic
- `app/(dashboard)/volunteers/import-actions.ts` — remove ministryId references
- `lib/validations/volunteer.ts` — remove ministryId / scopeType from schemas

### Ministry Volunteer Page
- `app/ministries/[id]/volunteer/page.tsx` — replace form with upcoming events list
- `app/volunteers/sign-up-actions.ts` — remove ministry sign-up action (or scope to event-only)

### Ministry Table
- `app/(dashboard)/ministries/` — add copy-link button to ministry table rows

### Event Workspace
- `app/(event)/event/[id]/volunteers/page.tsx` — remove ministry-grouping logic (all volunteers are now event-scoped)

### Volunteer Form
- `app/(dashboard)/volunteers/volunteer-form.tsx` — remove ministry/scope fields

### Public Event Sign-up
- `app/events/[id]/volunteer/page.tsx` — no changes needed (already event-scoped)

### Leader Approval
- `app/volunteer-approval/[token]/page.tsx` — no changes needed
