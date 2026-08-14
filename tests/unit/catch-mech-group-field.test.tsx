// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

import { CatchMechGroupField } from "@/components/breakouts/catch-mech-group-field"

/**
 * The Catch Mech DGroup field, as it appears in both breakout edit drawers and
 * the assign-facilitator dialog.
 *
 * The regression this pins: the explanation used to live *inside* the `<Label>`,
 * and `Label` is a flex row — so the hint became a second column and squeezed
 * "Catch Mech DGroup" onto two crowded lines in a 448px drawer. The hint has to
 * stay a sibling of the label, not a child of it.
 */

const LED_GROUPS = [
  { id: "sg-1", name: "Rache's Group" },
  { id: "sg-2", name: "Daughters of Zion" },
]

function renderField() {
  return render(
    <CatchMechGroupField
      id="test-catch-mech"
      ledGroups={LED_GROUPS}
      value="sg-2"
      onValueChange={vi.fn()}
    />
  )
}

describe("CatchMechGroupField", () => {
  it("keeps the label a single short line, with the hint outside it", () => {
    renderField()

    const label = screen.getByText("Catch Mech DGroup")
    expect(label.tagName).toBe("LABEL")
    expect(label.textContent).toBe("Catch Mech DGroup")

    const hint = screen.getByText(/requested into this dgroup/i)
    expect(label.contains(hint)).toBe(false)
  })

  it("points the label at the control it names", () => {
    renderField()

    const label = screen.getByText("Catch Mech DGroup")
    expect(label.getAttribute("for")).toBe("test-catch-mech")
    expect(document.getElementById("test-catch-mech")).not.toBeNull()
  })

  it("shows the picked DGroup", () => {
    renderField()
    expect(screen.getByText("Daughters of Zion")).toBeTruthy()
  })
})
