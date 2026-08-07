# Changelog

All notable changes to this project are documented here.

---

## [2026-08-07]

### ⚠️ Action required on deploy

- **Every event's walk-in form is now closed until someone opens it.** Walk-in is
  its own form with its own Public access switch (**Event → Forms → Walk-in
  Form**), and it starts off. Nothing on the door works until a staff member
  turns it on — including the "Register as a walk-in" links on the check-in
  board, which now explain the situation instead of leading to a closed page.
  Open it as part of setting up for the day, the same way sessions are opened.
- **Walk-in also needs a session named.** On multi-day and recurring events, pick
  which session the door registers people into on the same page. No session
  selected — or a session that's closed — keeps walk-in unavailable even with the
  switch on. One-time events don't need this.
- **Event Clusters get the same switch**, on **Cluster → Forms → Walk-in
  Registration**, also starting closed.

### Changed
- **CCF-133** — Walk-in registration is a first-class form. It has its own public
  link (`/events/[id]/walk-in`), its own page title, banner and success copy, and
  its own section/field configuration, all separate from the registration form
  people fill in ahead of the day. Closing pre-registration the night before no
  longer closes the door, and vice versa. Old `?checkin=` links redirect, so
  existing kiosk bookmarks and printed QR codes keep working.
- The walk-in session is now configuration rather than something carried in the
  URL, so a stale or shared link can no longer register someone into the wrong
  session.
- Pre-registration on a recurring event no longer marks attendance. Attendance is
  recorded only at check-in or through walk-in. This shows up as a lower
  pre-registered-vs-actual turnout ratio than before — the earlier figure was
  counting registrations as attendance.

---

## [2026-05-15]

### Added
- **List navigation on detail pages** — Registrant, volunteer, and breakout group detail pages now show prev/next arrows to step through the current list without going back. The list order is captured from `sessionStorage` when navigating from the list view.
- **Guest CSV import: gender and birth fields** — Guest import now accepts optional `gender` (Male/Female/M/F), `birthMonth` (1–12), and `birthYear` columns with hints shown in the import UI.
- **Breakout members table: attendance column and filters** — The separate Attendance tab in the breakout detail page has been removed; attendance data is now inline in the Members table alongside new search (name/mobile) and filter controls (All/Members/Guests, All/Attended/Not Attended).

### Changed
- Sessions page breakout-groups tab is now owned by `SessionAttendeesTable` to keep the server page clean and the tab state fully client-side.
- Prisma config now auto-detects the correct env file (`.env.local`, `.env.production`, or `.env`) and supports a `DATABASE_URL_UNPOOLED` fallback for Neon/Vercel pooled connections.

### Fixed
- **CCF-80** — Catch Mech form no longer triggers the Small Group setup UI for Timothy volunteers when all their participant decisions are pending or declined. The group-name prompt now only appears when at least one participant is confirmed.
- Registration page no longer shows a date label for recurring events.

---

## [2026-05-12]

### Added
- Event branding now carries through registration and check-in headers, with ministry-aware logos and primary colors on public event pages.
- Check-in and registration flows use a dedicated year input for birth year entry.
- Matching priorities settings were redesigned with slider presets, clearer labels, and auto-save.
- Added regression coverage for breakout facilitator assignment and next/cache test passthrough.

### Changed
- Matching weights are now edited as relative priorities instead of raw values that must sum to 1.000.
- Event dashboard metadata and filters were tightened up visually, with branded surfaces for one-time events.
- Small group detail tabs now show pending requests as a badge, and breakout facilitator updates revalidate the event breakout workspace directly.

### Fixed
- Breakout facilitator updates now revalidate the event breakout route instead of the stale `/events/[id]` path.

## [2026-05-08]

### Added
- **Check-in: Name + Date of Birth lookup mode** — Attendees who don't have their phone number or email handy can now check in using their last name, birth month, and birth year. Supports guest and member-linked registrants, case-insensitive last name matching, ambiguous match disambiguation, and occurrence-scoped check-in status for recurring events.
- **Event-scoped volunteer detail page** — New page at `/event/[id]/volunteers/[volunteerId]` for viewing and managing a volunteer's committee/role assignment from within the event workspace.
- **Integration tests for profile-based check-in lookup** — Covers core matching, case insensitivity, whitespace trimming, ambiguous results, check-in status (one-time and recurring), and UI wiring regression checks.

### Fixed
- Volunteer links in the event volunteers tab (table rows, cards, and action menu) now navigate to the event-scoped route instead of the stale `/volunteers/[id]` route.

---

## [2026-05-07]

### Added
- Ministry and event branding with logo uploads.
- Member transfer controls for moving members between small groups.
- Image domain `images.ccfeastwood.app` added to Next.js config for remote image support.

---

## [2026-05-06]

### Added
- Breadcrumb navigation component and shared `DetailPageHeader` used across member, guest, event, and small group detail pages.

---

## [2026-05-05]

### Added
- Small Groups: leader confirmation entry page with temp member count display.
- Vertical timeline activity logs across member, guest, and catch-mech detail views.
- `CatchMechComments` displayed on member and guest profile pages.

### Fixed
- Catch Mech stat card UX polish, date input padding corrections, and minor visual fixes.

---

## [2026-05-04]

### Added
- Catch Mech: threaded activity log and comments replace flat request notes.
- Dashboard activity stats panel.
- Duplicate profile detection at check-in and registration.
- Ambiguous mobile/email lookup disambiguation UI on the check-in board.
