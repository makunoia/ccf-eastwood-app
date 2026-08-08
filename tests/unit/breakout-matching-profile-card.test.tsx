// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import { MatchingProfile } from "@/components/breakouts/matching-profile"
import { FacilitatorLeadership } from "@/components/breakouts/facilitator-leadership"
import type { BreakoutMatchingProfile } from "@/lib/breakouts/profile"

/**
 * The breakout group's Matching Profile card.
 *
 * Four factors, four tiles. There is now exactly one empty state: the criteria
 * are the group's own and always editable, so "use Edit" is never a dead end.
 * (It used to be — an inherited profile was read-only in both drawers, and the
 * card still told the admin to Edit it.)
 */

const EMPTY: BreakoutMatchingProfile = {
  lifeStages: [],
  genderFocus: null,
  language: [],
  ageRangeMin: null,
  ageRangeMax: null,
}

describe("MatchingProfile", () => {
  it("shows one sentence, not four Any tiles, when nothing is set", () => {
    render(<MatchingProfile profile={EMPTY} />)

    expect(screen.getByText(/no matching criteria yet/i)).toBeTruthy()
    expect(screen.queryByText("Life Stage")).toBeNull()
  })

  it("renders every factor once anything is set", () => {
    render(
      <MatchingProfile
        profile={{ ...EMPTY, genderFocus: "Female", language: ["English"] }}
      />
    )

    expect(screen.queryByText(/no matching criteria yet/i)).toBeNull()
    expect(screen.getByText("Female")).toBeTruthy()
    expect(screen.getByText("English")).toBeTruthy()
    // Unset factors stay visible as "Any" — "matches everyone" is a real answer.
    expect(screen.getAllByText("Any").length).toBe(2)
  })

  it("renders a footnote below the tiles", () => {
    render(
      <MatchingProfile
        profile={{ ...EMPTY, genderFocus: "Male" }}
        footnote={<p>seeds their DGroup</p>}
      />
    )
    expect(screen.getByText(/seeds their dgroup/i)).toBeTruthy()
  })
})

describe("FacilitatorLeadership", () => {
  it("names the DGroups a facilitator leads and links to them", () => {
    render(<FacilitatorLeadership ledGroups={[{ id: "sg-1", name: "Rache's Group" }]} />)

    const link = screen.getByRole("link", { name: "Rache's Group" })
    expect(link.getAttribute("href")).toBe("/small-groups/sg-1")
  })

  it("lists several groups", () => {
    render(
      <FacilitatorLeadership
        ledGroups={[
          { id: "a", name: "Alpha" },
          { id: "b", name: "Bravo" },
        ]}
      />
    )
    expect(screen.getByText("Alpha")).toBeTruthy()
    expect(screen.getByText("Bravo")).toBeTruthy()
  })

  it("calls out a facilitator who leads nothing yet", () => {
    render(<FacilitatorLeadership ledGroups={[]} />)
    expect(screen.getByText(/does not lead a dgroup yet \(timothy\)/i)).toBeTruthy()
  })

  // Inside an edit drawer a link would navigate away and lose the form.
  it("can render the group names unlinked", () => {
    render(
      <FacilitatorLeadership ledGroups={[{ id: "sg-1", name: "Rache's Group" }]} linkGroups={false} />
    )
    expect(screen.queryByRole("link")).toBeNull()
    expect(screen.getByText("Rache's Group")).toBeTruthy()
  })
})
