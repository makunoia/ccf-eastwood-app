// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"

import {
  LeaderGroupPicker,
  type LeaderOption,
} from "@/app/me/[token]/portal-shared"

/**
 * The /me portal's "who is your leader?" → "which of their groups?" two-step.
 *
 * The regression pinned here: step 2 was a Radix `Select` whose trigger carried
 * custom content instead of a `Select.Value`. `position="item-aligned"` — the
 * default in `components/ui/select.tsx` — bails out of placing *and* focusing the
 * list when there is no value node or no already-selected item, so the DGroup list
 * never opened usably. A leader with a single group is auto-selected and skips
 * step 2 entirely, which is why the break only ever showed for a leader running
 * two or more groups.
 *
 * The picker is a searchable `PersonCombobox` now, so these also cover the search.
 */

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

const MULTI: LeaderOption = {
  id: "leader-multi",
  name: "Ana Reyes",
  groups: [
    {
      id: "g-tue",
      name: "Tuesday Warriors",
      groupType: "Regular",
      meetingFormat: "Online",
      scheduleDayOfWeek: 2,
      scheduleTimeStart: "19:00",
      scheduleTimeEnd: "21:00",
    },
    {
      id: "g-sat",
      name: "Saturday Couples",
      groupType: "Couples",
      meetingFormat: "InPerson",
      scheduleDayOfWeek: 6,
      scheduleTimeStart: "09:00",
      scheduleTimeEnd: "11:00",
    },
  ],
}

const SOLO: LeaderOption = {
  id: "leader-solo",
  name: "Ben Cruz",
  groups: [
    {
      id: "g-solo",
      name: "Thursday Anchor",
      groupType: "Regular",
      meetingFormat: "Hybrid",
      scheduleDayOfWeek: 4,
      scheduleTimeStart: "20:00",
      scheduleTimeEnd: null,
    },
  ],
}

const OPTIONS = [MULTI, SOLO]

function renderPicker(
  overrides: Partial<React.ComponentProps<typeof LeaderGroupPicker>> = {}
) {
  const onLeaderChange = vi.fn()
  const onGroupChange = vi.fn()
  const utils = render(
    <LeaderGroupPicker
      leaderOptions={OPTIONS}
      selectedLeaderId=""
      onLeaderChange={onLeaderChange}
      selectedGroupId=""
      onGroupChange={onGroupChange}
      {...overrides}
    />
  )
  return { ...utils, onLeaderChange, onGroupChange }
}

/** The two comboboxes, in the order the person answers them. */
function fields() {
  const [leader, group] = screen.getAllByRole("combobox")
  return { leader, group }
}

/** The open popover's listbox — the rows are plain buttons inside it. */
function openList(trigger: HTMLElement) {
  fireEvent.click(trigger)
  return screen.getByRole("listbox")
}

describe("LeaderGroupPicker — step 1, the leader", () => {
  it("lists every leader and flags the ones running more than one group", () => {
    renderPicker()
    const list = openList(fields().leader)

    expect(within(list).getByText("Ana Reyes")).toBeTruthy()
    expect(within(list).getByText("Ben Cruz")).toBeTruthy()
    // Ben leads one group, so no count to disambiguate.
    expect(within(list).getByText("2 groups")).toBeTruthy()
    expect(within(list).queryByText("1 groups")).toBeNull()
  })

  it("filters the leaders by name as you type", () => {
    renderPicker()
    const list = openList(fields().leader)

    fireEvent.change(screen.getByPlaceholderText("Search leaders…"), {
      target: { value: "cruz" },
    })

    expect(within(list).getByText("Ben Cruz")).toBeTruthy()
    expect(within(list).queryByText("Ana Reyes")).toBeNull()
  })

  it("auto-selects the only group of a single-group leader", () => {
    const { onLeaderChange, onGroupChange } = renderPicker()
    openList(fields().leader)

    fireEvent.click(screen.getByText("Ben Cruz"))

    expect(onLeaderChange).toHaveBeenCalledWith("leader-solo")
    expect(onGroupChange).toHaveBeenCalledWith("g-solo")
  })

  it("clears the group when the chosen leader runs several", () => {
    const { onGroupChange } = renderPicker({
      selectedLeaderId: "leader-solo",
      selectedGroupId: "g-solo",
    })
    openList(fields().leader)

    fireEvent.click(screen.getByText("Ana Reyes"))

    // Nothing of Ben's may survive into Ana's list — step 2 has to be re-answered.
    expect(onGroupChange).toHaveBeenCalledWith("")
  })
})

describe("LeaderGroupPicker — step 2, the DGroup", () => {
  it("stays shut until a leader is chosen", () => {
    renderPicker()
    const { group } = fields()

    expect(group).toHaveProperty("disabled", true)
    expect(group.textContent).toContain("Choose a leader first")
  })

  it("opens and picks when the leader runs several groups (the regression)", () => {
    const { onGroupChange } = renderPicker({ selectedLeaderId: "leader-multi" })
    const { group } = fields()

    expect(group).toHaveProperty("disabled", false)
    const list = openList(group)

    expect(within(list).getByText("Tuesday Warriors")).toBeTruthy()
    expect(within(list).getByText("Saturday Couples")).toBeTruthy()

    fireEvent.click(within(list).getByText("Saturday Couples"))
    expect(onGroupChange).toHaveBeenCalledWith("g-sat")
  })

  it("carries each group's schedule and its Couples tag into the row", () => {
    renderPicker({ selectedLeaderId: "leader-multi" })
    const list = openList(fields().group)

    // The name is the searchable label; the schedule rides alongside it.
    expect(within(list).getByText(/^Tuesdays? ·/)).toBeTruthy()
    // The tag is the only thing separating a couples group from a regular one.
    expect(within(list).getByText("Couples")).toBeTruthy()
  })

  it("filters the leader's groups by name as you type", () => {
    renderPicker({ selectedLeaderId: "leader-multi" })
    const list = openList(fields().group)

    fireEvent.change(screen.getByPlaceholderText("Search groups…"), {
      target: { value: "satur" },
    })

    expect(within(list).getByText("Saturday Couples")).toBeTruthy()
    expect(within(list).queryByText("Tuesday Warriors")).toBeNull()
  })

  it("shows the chosen group's details once it is picked", () => {
    renderPicker({ selectedLeaderId: "leader-multi", selectedGroupId: "g-sat" })

    expect(screen.getByText("Schedule")).toBeTruthy()
    expect(screen.getByText("Mode")).toBeTruthy()
    expect(screen.getByText("In Person")).toBeTruthy()
  })
})
