// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import { MinistryAvatar, initialsFor } from "@/components/ministry-avatar"

/**
 * The ministry badge, shared by the admin ministry picker and the collab
 * registration form's ministry step (CCF-148).
 *
 * The fallback is the point: a list where some ministries show a logo and others
 * show nothing reads as broken, so an absent logo still occupies the same box.
 */

describe("initialsFor", () => {
  it("takes the first letter of the first two words", () => {
    expect(initialsFor("Young Professionals")).toBe("YP")
  })

  it("stops at two words", () => {
    expect(initialsFor("Kids Ministry Team")).toBe("KM")
  })

  it("handles a single word", () => {
    expect(initialsFor("Youth")).toBe("Y")
  })

  it("survives extra whitespace rather than emitting blanks", () => {
    expect(initialsFor("  Singles   Connect ")).toBe("SC")
  })

  it("is empty for an empty name instead of throwing", () => {
    expect(initialsFor("")).toBe("")
  })
})

describe("MinistryAvatar", () => {
  it("renders the logo when there is one", () => {
    render(
      <MinistryAvatar
        ministry={{ name: "Youth", logoUrl: "https://images.ccfeastwood.app/y.png" }}
      />
    )
    const img = screen.getByRole("presentation", { hidden: true })
    expect(img.getAttribute("src")).toBe("https://images.ccfeastwood.app/y.png")
  })

  it("falls back to initials when there is no logo", () => {
    render(<MinistryAvatar ministry={{ name: "Singles Connect", logoUrl: null }} />)
    expect(screen.getByText("SC")).toBeTruthy()
  })

  it("lets the caller size it — the public form wants a bigger badge", () => {
    const { container } = render(
      <MinistryAvatar ministry={{ name: "Youth", logoUrl: null }} className="size-10" />
    )
    expect(container.firstElementChild?.className).toContain("size-10")
  })
})
