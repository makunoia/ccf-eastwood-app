// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

import { FormConfigEditor } from "@/app/(dashboard)/forms/form-config-editor"
import { CheckinFormsCard } from "@/app/(event)/cluster/[id]/forms/checkin-forms-card"

/**
 * How the admin Forms screens open the public forms they configure.
 *
 * The rule (CLAUDE.md): admin navigation never uses `target="_blank"`, with one
 * exception — links that leave the workspace for a public form or a print
 * surface. Those are worked *alongside* the screen that launched them: an admin
 * checks the form, fills it in, submits it, and the config they were editing has
 * to still be sitting there behind it. Navigating in place throws that away and
 * strands them on a public success screen with no way back into the app.
 *
 * So every one of them is pinned here for all three parts of the contract:
 * `target="_blank"`, `rel=noopener` (a bare _blank hands the public page a live
 * `window.opener` back into an authenticated screen), and the sr-only hint that
 * tells a screen-reader user the tab is about to change under them.
 */

vi.mock("@/app/(dashboard)/forms/actions", () => ({
  saveFormConfig: vi.fn(),
  setFormOpen: vi.fn(),
}))

const EMPTY_THEME = {
  title: "",
  description: "",
  logoUrl: "",
  bannerUrl: "",
  primaryColor: "",
}

function renderEditor(publicUrl?: string | null) {
  return render(
    <FormConfigEditor
      formKey="EventRegistration"
      eventId="e1"
      initialIsOpen
      initialTheme={EMPTY_THEME}
      themeFields={[]}
      publicUrl={publicUrl}
    />
  )
}

describe("form config editor — View public form", () => {
  it("opens the public form in a new tab", () => {
    renderEditor("/events/e1/register")
    const link = screen.getByRole("link", { name: /^View public form/ })
    expect(link.getAttribute("href")).toBe("/events/e1/register")
    expect(link.getAttribute("target")).toBe("_blank")
  })

  it("pairs the new tab with rel=noopener and says so for screen readers", () => {
    renderEditor("/events/e1/register")
    const link = screen.getByRole("link", { name: /^View public form/ })
    expect(link.getAttribute("rel")).toContain("noopener")
    expect(link.textContent).toContain("opens in a new tab")
  })

  // Check-in is a kiosk surface an admin has no reason to open from here, so the
  // page passes no URL — the section renders without a dead link.
  it("renders no link at all when the form has no public URL", () => {
    renderEditor(undefined)
    expect(screen.queryByRole("link", { name: /View public form/ })).toBeNull()
  })
})

describe("cluster Forms — the day's check-in links", () => {
  // A row is now exactly a resolved shortcut, so the card can't disagree with the
  // kiosk about whether a link is live.
  const rows = [
    {
      eventId: "e1",
      eventName: "Sunday Service",
      eventType: "Recurring" as const,
      href: "/events/e1/checkin/o1",
      sessionDate: new Date("2026-08-19T00:00:00.000Z"),
      status: "open" as const,
      manageHref: "/event/e1/sessions",
    },
  ]

  it("opens each event's check-in form in a new tab", () => {
    render(<CheckinFormsCard rows={rows} />)
    const link = screen.getByRole("link", { name: /^View check-in form/ })
    expect(link.getAttribute("href")).toBe("/events/e1/checkin/o1")
    expect(link.getAttribute("target")).toBe("_blank")
    expect(link.getAttribute("rel")).toContain("noopener")
    expect(link.textContent).toContain("opens in a new tab")
  })

  // The Configure link beside it is ordinary in-workspace navigation — a second
  // copy of the admin app in a new tab is not what anyone wants.
  it("keeps the Configure link in the same tab", () => {
    render(<CheckinFormsCard rows={rows} />)
    const link = screen.getByRole("link", { name: "Configure" })
    expect(link.getAttribute("href")).toBe("/event/e1/sessions")
    expect(link.getAttribute("target")).toBeNull()
  })

  // Regression: the card used to compute its own status by matching ANY open
  // occurrence of the event — so an event with a session open on some other date
  // was badged "Session open" here while the kiosk skipped it as `noSession`. The
  // row is the resolved shortcut now, so the two can't disagree.
  it("offers no link for an event the kiosk would skip", () => {
    render(
      <CheckinFormsCard
        rows={[
          {
            eventId: "e2",
            eventName: "Camp",
            eventType: "Recurring",
            href: null,
            sessionDate: null,
            status: "noSession",
            manageHref: "/event/e2/sessions",
          },
        ]}
      />
    )
    expect(screen.queryByRole("link", { name: /^View check-in form/ })).toBeNull()
    expect(screen.getByText(/No session on this day/)).toBeTruthy()
    expect(screen.getByRole("link", { name: "Open a session" })).toBeTruthy()
  })
})
