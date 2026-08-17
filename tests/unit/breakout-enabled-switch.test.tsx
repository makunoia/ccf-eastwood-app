// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

import { BreakoutEnabledSwitch } from "@/app/(event)/event/[id]/breakouts/enabled-switch"
import { eventSurface } from "@/lib/breakouts/owner"

/**
 * The breakout group on/off switch.
 *
 * It moves before the server answers, which is the whole point — the alternative
 * is a control that sits still for a round trip and invites a second click. The
 * spec that matters is therefore the other half: when the write fails, the
 * switch must go back, or the list quietly disagrees with the database.
 */

const { setBreakoutGroupEnabled, toastSuccess, toastError } = vi.hoisted(() => ({
  setBreakoutGroupEnabled: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock("@/app/(dashboard)/events/breakout-actions", () => ({ setBreakoutGroupEnabled }))
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: toastError } }))

beforeEach(() => {
  vi.clearAllMocks()
})

function renderSwitch(isEnabled: boolean) {
  render(
    <BreakoutEnabledSwitch
      groupId="g1"
      surface={eventSurface("e1")}
      isEnabled={isEnabled}
      groupName="Table 1"
    />
  )
  return screen.getByRole("switch")
}

describe("BreakoutEnabledSwitch", () => {
  it("names the group and the action it will take", () => {
    // A switch alone in a table cell has no visible label to read.
    const el = renderSwitch(true)
    expect(el.getAttribute("aria-label")).toBe("Disable Table 1")
  })

  it("flips before the server answers, and stays flipped on success", async () => {
    setBreakoutGroupEnabled.mockResolvedValue({ success: true, data: undefined })
    const el = renderSwitch(true)

    fireEvent.click(el)

    await waitFor(() => expect(el.getAttribute("aria-checked")).toBe("false"))
    expect(setBreakoutGroupEnabled).toHaveBeenCalledWith("g1", { eventId: "e1" }, false)
    // Says what "off" means rather than just "saved" — the consequence is not
    // obvious from the control.
    expect(toastSuccess).toHaveBeenCalledWith(
      expect.stringContaining("no new people will be placed here")
    )
    expect(el.getAttribute("aria-label")).toBe("Enable Table 1")
  })

  it("reverts when the write fails", async () => {
    setBreakoutGroupEnabled.mockResolvedValue({
      success: false,
      error: "Breakout group not found",
    })
    const el = renderSwitch(true)

    fireEvent.click(el)

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Breakout group not found"))
    expect(el.getAttribute("aria-checked")).toBe("true")
  })

  it("switches back on from off", async () => {
    setBreakoutGroupEnabled.mockResolvedValue({ success: true, data: undefined })
    const el = renderSwitch(false)
    expect(el.getAttribute("aria-label")).toBe("Enable Table 1")

    fireEvent.click(el)

    await waitFor(() => expect(el.getAttribute("aria-checked")).toBe("true"))
    expect(setBreakoutGroupEnabled).toHaveBeenCalledWith("g1", { eventId: "e1" }, true)
    expect(toastSuccess).toHaveBeenCalledWith(
      expect.stringContaining("can receive people again")
    )
  })

  it("shows the On/Off word only where asked", () => {
    const { rerender } = render(
      <BreakoutEnabledSwitch groupId="g1" surface={eventSurface("e1")} isEnabled={false} groupName="Table 1" />
    )
    expect(screen.queryByText("Off")).toBeNull()

    rerender(
      <BreakoutEnabledSwitch
        groupId="g1"
        surface={eventSurface("e1")}
        isEnabled={false}
        groupName="Table 1"
        showLabel
      />
    )
    expect(screen.getByText("Off")).toBeTruthy()
  })
})
