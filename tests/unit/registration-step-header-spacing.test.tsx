// @vitest-environment jsdom
import * as React from "react"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

import { RegistrationForm } from "@/app/events/[id]/register/registration-form"
import { BARE_EVENT_FORM_CONFIG } from "@/lib/forms/context-config"

/**
 * Vertical rhythm of the step header — the block holding the progress dots and
 * the section title, above the fields.
 *
 * The header and the CardContent below it each used to add padding of their own
 * (`pt-4 pb-1` / `pt-4`) *on top of* the Card's `gap-6`. That put ~16px above the
 * title and ~44px below it, so the title read as crowded against the card's top
 * edge and marooned from the first field. Worst on a one-step form, where the
 * progress row isn't there to take up the slack — which is exactly the config a
 * bare event lands on.
 *
 * The rule these specs pin: the Card's `gap-6` is the *only* spacer between the
 * header and the fields, and it's matched by the header's own `pt-6` above. Both
 * layouts get the same rhythm, because both render the same chrome.
 */

const {
  lookupProfileByMobile,
  revealProfileForRegistration,
  lookupMemberForRegistration,
  createRegistrant,
} = vi.hoisted(() => ({
  lookupProfileByMobile: vi.fn(),
  revealProfileForRegistration: vi.fn(),
  lookupMemberForRegistration: vi.fn(),
  createRegistrant: vi.fn(),
}))

vi.mock("@/app/(dashboard)/events/registration-lookup-actions", () => ({
  lookupProfileByMobile,
  revealProfileForRegistration,
}))
vi.mock("@/app/(dashboard)/events/actions", () => ({
  lookupMemberForRegistration,
  createRegistrant,
  createHouseholdRegistration: vi.fn(),
}))
vi.mock("@/app/(dashboard)/events/cluster-actions", () => ({ registerForCluster: vi.fn() }))
vi.mock("@/app/(dashboard)/guests/actions", () => ({
  searchMembersForLeaderLookup: vi.fn(async () => ({ success: true, data: [] })),
}))

beforeAll(() => {
  // Radix probes for all of these in jsdom.
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.setPointerCapture ??= () => {}
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

beforeEach(() => {
  lookupMemberForRegistration.mockReset()
  createRegistrant.mockReset()
  lookupMemberForRegistration.mockResolvedValue(null)
  createRegistrant.mockResolvedValue({ success: true, data: { breakoutGroup: null } })
})

/** Renders and walks past the mobile-number gate to the form itself. */
function renderAtStepOne(config: Partial<typeof BARE_EVENT_FORM_CONFIG> = {}) {
  const view = render(
    <RegistrationForm
      eventId="e1"
      eventName="Sunday Service"
      config={{ ...BARE_EVENT_FORM_CONFIG, ...config }}
    />
  )
  fireEvent.click(screen.getByRole("button", { name: /Start a new registration/i }))
  return view
}

/** The block wrapping the progress row and the section title. */
function header() {
  const title = screen.getByText("Personal Information")
  const block = title.parentElement
  if (!block) throw new Error("step header not found")
  return block
}

function fieldsWrapper() {
  const el = document.querySelector<HTMLElement>("[data-slot=card-content]")
  if (!el) throw new Error("card content not found")
  return el
}

describe.each([
  ["one-step form", {}],
  ["multi-step form", { sectionSmallGroup: true }],
])("step header rhythm — %s", (_label, config) => {
  it("leaves the spacing below the title to the Card's own gap", () => {
    renderAtStepOne(config)

    // No bottom padding on the header and no top padding on the fields: adding
    // either back stacks on top of `gap-6` and reopens the gulf under the title.
    expect(header().className).not.toMatch(/\bpb-/)
    expect(fieldsWrapper().className).not.toMatch(/\bpt-/)
  })

  it("gives the title the same room above it that the gap gives below", () => {
    renderAtStepOne(config)

    expect(header().className).toContain("pt-6")
  })
})

describe("step header — one-step form", () => {
  it("drops the progress row, so the title carries the header alone", () => {
    renderAtStepOne()

    expect(screen.queryByText(/^Step \d+ of \d+$/)).toBeNull()
    expect(screen.getByText("Personal Information")).toBeTruthy()
  })
})

describe("step header — multi-step form", () => {
  it("still reports progress above the title", () => {
    renderAtStepOne({ sectionSmallGroup: true })

    expect(screen.getByText("Step 1 of 2")).toBeTruthy()
  })
})
