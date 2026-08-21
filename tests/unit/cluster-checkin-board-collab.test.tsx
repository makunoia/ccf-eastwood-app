// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import { ClusterCheckinClient } from "@/app/(event)/cluster/[id]/checkin/checkin-client"
import { ClusterCheckinShortcuts } from "@/app/(event)/cluster/[id]/checkin/checkin-shortcuts"
import type { ClusterCheckinShortcut } from "@/lib/clusters/checkin-shortcuts"

/**
 * The ADMIN check-in board on a Collab day.
 *
 * Its public counterpart (`cluster-checkin-collab.test.tsx`) already pins that the
 * kiosk names no events. This file pins the same rule one screen back: the board a
 * staffer keeps up all day must not re-expose the split either — no per-event door
 * to a room that is half the day, and no badge column repeating one ministry's
 * event name down every row.
 *
 * The page decides which mode to render via `clusterOffersPerEventCheckin`; these
 * assertions are about what each mode actually puts on screen.
 */

function shortcut(overrides: Partial<ClusterCheckinShortcut> = {}): ClusterCheckinShortcut {
  return {
    eventId: "e-youth",
    eventName: "Youth Night",
    eventType: "Recurring",
    href: "/events/e-youth/checkin/occ-1",
    sessionDate: new Date("2026-08-09T00:00:00.000Z"),
    status: "open",
    manageHref: "/event/e-youth/sessions",
    ...overrides,
  }
}

function renderShortcuts(shortcuts: ClusterCheckinShortcut[]) {
  return render(
    <ClusterCheckinShortcuts
      shortcuts={shortcuts}
      checkInHref="/register/c/tok-1/check-in"
      checkInSettingsHref={null}
      walkInHref="/register/c/tok-1/walk-in"
      walkInSettingsHref={null}
      canConfigure
    />
  )
}

const person = (overrides: Partial<React.ComponentProps<typeof ClusterCheckinClient>["people"][number]> = {}) => ({
  key: "member:m1",
  name: "Maria Cruz",
  phone: "+63 917 111 2222",
  isMember: true,
  isVolunteer: false,
  events: [{ eventId: "e-youth", eventName: "Youth Night", checkedIn: false }],
  fullyCheckedIn: false,
  ...overrides,
})

describe("collab admin board — Shortcuts", () => {
  // The page passes `shortcuts={[]}` on a Collab day; the section must still be
  // the day's two doors rather than disappearing with them.
  it("keeps both day-wide doors when there are no per-event ones", () => {
    renderShortcuts([])
    expect(screen.getByRole("link", { name: /^Open Day check-in/ })).toBeTruthy()
    expect(screen.getByRole("link", { name: /^Open Walk-in registration/ })).toBeTruthy()
  })

  it("names no member event", () => {
    renderShortcuts([])
    expect(screen.queryByText("Youth Night")).toBeNull()
    expect(screen.queryByRole("link", { name: /^Check-in/ })).toBeNull()
  })

  it("still offers the per-event door on a parallel day", () => {
    renderShortcuts([shortcut()])
    expect(screen.getByText("Youth Night")).toBeTruthy()
    expect(
      screen.getByRole("link", { name: /^Check-in/ }).getAttribute("href")
    ).toBe("/events/e-youth/checkin/occ-1")
  })
})

describe("collab admin board — Arrivals", () => {
  it("drops the per-event badge from every row", () => {
    render(
      <ClusterCheckinClient
        people={[person()]}
        hasCheckinEvents
        showEventBreakdown={false}
      />
    )
    expect(screen.getByText("Maria Cruz")).toBeTruthy()
    expect(screen.queryByText("Youth Night")).toBeNull()
  })

  // The badges were what said "not here yet". Collapsed, the row has to say it.
  it("says in words whether each person is in", () => {
    render(
      <ClusterCheckinClient
        people={[
          person(),
          person({
            key: "member:m2",
            name: "Jon Reyes",
            events: [{ eventId: "e-youth", eventName: "Youth Night", checkedIn: true }],
            fullyCheckedIn: true,
          }),
        ]}
        hasCheckinEvents
        showEventBreakdown={false}
      />
    )
    expect(screen.getByText("Not in yet")).toBeTruthy()
    expect(screen.getByText("Checked in")).toBeTruthy()
  })

  // With the badges on, "Checked in" beside an already-filled badge row is the
  // page saying one thing twice — so the collapsed-only label must stay off.
  it("keeps the badges and no 'Not in yet' on a parallel day", () => {
    render(<ClusterCheckinClient people={[person()]} hasCheckinEvents />)
    expect(screen.getByText("Youth Night")).toBeTruthy()
    expect(screen.queryByText("Not in yet")).toBeNull()
  })
})
