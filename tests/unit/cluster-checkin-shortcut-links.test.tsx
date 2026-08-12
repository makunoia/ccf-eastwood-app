// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import type { ClusterCheckinShortcut } from "@/lib/clusters/checkin-shortcuts"
import { ClusterCheckinShortcuts } from "@/app/(event)/cluster/[id]/checkin/checkin-shortcuts"

/**
 * How the Shortcuts section on the cluster check-in board opens what it points at.
 *
 * The regression these pin: the board is a live monitor a staffer keeps up all
 * day, and its public form links used to navigate in place — so every trip to the
 * door threw the board away. The public links now open in a new tab; the admin
 * fix-it links beside them must NOT, since those are ordinary in-workspace
 * navigation and a second copy of the app is not what anyone wants.
 */

function makeShortcut(overrides: Partial<ClusterCheckinShortcut> = {}): ClusterCheckinShortcut {
  return {
    eventId: "e1",
    eventName: "Sunday Service",
    eventType: "Recurring",
    href: "/events/e1/checkin/occ-1",
    sessionDate: new Date("2026-08-09T00:00:00.000Z"),
    status: "open",
    manageHref: "/event/e1/sessions",
    ...overrides,
  }
}

function renderShortcuts(props: Partial<React.ComponentProps<typeof ClusterCheckinShortcuts>> = {}) {
  return render(
    <ClusterCheckinShortcuts
      shortcuts={[makeShortcut()]}
      checkInHref="/register/c/tok-1/check-in"
      checkInSettingsHref={null}
      walkInHref="/register/c/tok-1/walk-in"
      walkInSettingsHref={null}
      canConfigure
      {...props}
    />
  )
}

/**
 * Accessible names carry the sr-only hint, so match on the visible label plus
 * the row name — the two day-wide doors both show a button reading "Open".
 */
const checkinLink = () => screen.getByRole("link", { name: /^Check-in/ })
const walkInLink = () => screen.getByRole("link", { name: /^Open Walk-in registration/ })
const kioskLink = () => screen.getByRole("link", { name: /^Open Day check-in/ })

describe("cluster check-in shortcuts — link targets", () => {
  it("opens an event's check-in form in a new tab", () => {
    renderShortcuts()
    const link = checkinLink()
    expect(link.getAttribute("href")).toBe("/events/e1/checkin/occ-1")
    expect(link.getAttribute("target")).toBe("_blank")
  })

  it("opens the walk-in form in a new tab", () => {
    renderShortcuts()
    const link = walkInLink()
    expect(link.getAttribute("href")).toBe("/register/c/tok-1/walk-in")
    expect(link.getAttribute("target")).toBe("_blank")
  })

  // A `target="_blank"` link without this hands the opened page a live
  // `window.opener` back into the authenticated board.
  it("opens the day's check-in kiosk in a new tab", () => {
    renderShortcuts()
    const link = kioskLink()
    expect(link.getAttribute("href")).toBe("/register/c/tok-1/check-in")
    expect(link.getAttribute("target")).toBe("_blank")
  })

  // A `target="_blank"` link without this hands the opened page a live
  // `window.opener` back into the authenticated board.
  it("pairs every new-tab link with rel=noopener", () => {
    renderShortcuts()
    for (const link of [checkinLink(), walkInLink(), kioskLink()]) {
      expect(link.getAttribute("rel")).toContain("noopener")
    }
  })

  it("names the new tab for screen readers", () => {
    renderShortcuts()
    expect(checkinLink().textContent).toContain("opens in a new tab")
    // The two day-wide doors carry it in their aria-label, which is also what
    // tells them apart — both buttons read "Open".
    for (const link of [walkInLink(), kioskLink()]) {
      expect(link.getAttribute("aria-label")).toContain("opens in a new tab")
    }
  })

  it("keeps the admin fix-it link for a closed session in the same tab", () => {
    renderShortcuts({
      shortcuts: [makeShortcut({ href: null, status: "sessionClosed" })],
      walkInHref: null,
    })
    const manage = screen.getByRole("link", { name: "Open a session" })
    expect(manage.getAttribute("href")).toBe("/event/e1/sessions")
    expect(manage.getAttribute("target")).toBeNull()
  })

  it("keeps the walk-in settings link in the same tab while the door is closed", () => {
    renderShortcuts({
      walkInHref: null,
      walkInSettingsHref: "/cluster/c1/forms/walk-in",
    })
    const settings = screen.getByRole("link", { name: "Open it on the Walk-in form" })
    expect(settings.getAttribute("href")).toBe("/cluster/c1/forms/walk-in")
    expect(settings.getAttribute("target")).toBeNull()
  })

  it("swaps the kiosk button for its switch link while check-in is closed", () => {
    renderShortcuts({
      checkInHref: null,
      checkInSettingsHref: "/cluster/c1/forms/check-in",
    })
    expect(screen.queryByRole("link", { name: /^Open Day check-in/ })).toBeNull()
    const settings = screen.getByRole("link", { name: "Open it on the Check-in form" })
    expect(settings.getAttribute("href")).toBe("/cluster/c1/forms/check-in")
    expect(settings.getAttribute("target")).toBeNull()
  })

  // Read-only staff get neither the link nor the switch — both hrefs arrive null
  // and the row must disappear rather than render a button that goes nowhere.
  it("drops the kiosk row entirely when neither link is available", () => {
    renderShortcuts({ checkInHref: null, checkInSettingsHref: null })
    expect(screen.queryByText("Day check-in")).toBeNull()
  })
})
