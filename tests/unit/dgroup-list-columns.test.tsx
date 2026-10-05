// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { SmallGroupsTable } from "@/app/(dashboard)/small-groups/small-groups-table"
import { buildColumns, type SmallGroupRow } from "@/app/(dashboard)/small-groups/columns"
import { TablePreferencesProvider } from "@/components/tables/table-preferences-provider"

vi.mock("@/app/(dashboard)/small-groups/actions", () => ({ deleteSmallGroup: vi.fn() }))
vi.mock("@/lib/tables/actions", () => ({ saveTablePreference: vi.fn(), resetTablePreference: vi.fn() }))
beforeAll(() => {
  window.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver
})

const group: SmallGroupRow = {
  id: "g1", name: "Sunday Group", status: "Active", groupType: "Regular",
  leaderName: "Maria Santos", leaderId: "m1", leaderFirstName: "Maria", leaderLastName: "Santos", leaderEmail: null, leaderPhone: null,
  parentGroupId: null, parentGroupName: null, parentSatellite: null,
  memberCount: 3, tempMemberCount: 5, lifeStages: [], language: [], genderFocus: null,
  ageRangeMin: null, ageRangeMax: null, meetingFormat: null, locationCity: null, memberLimit: null,
  scheduleDayOfWeek: 0, scheduleTimeStart: "09:00", scheduleTimeEnd: "11:00",
}

describe("DGroup list schedule", () => {
  it("replaces temp members with a visible schedule column and mobile field", () => {
    const ids = buildColumns().map((column) => column.id ?? (column as { accessorKey?: string }).accessorKey)
    expect(ids).toContain("schedule")
    expect(ids).not.toContain("tempMemberCount")
    render(<TablePreferencesProvider initial={{ "small-groups": { hidden: [], shown: [], order: ["name", "tempMemberCount", "memberCount"], density: "Comfortable" } }}><SmallGroupsTable groups={[group]} /></TablePreferencesProvider>)
    expect(screen.getByRole("columnheader", { name: "Schedule" })).toBeTruthy()
    expect(screen.queryByText("Temp Members")).toBeNull()
    expect(screen.getAllByText("Sunday · 9:00 AM – 11:00 AM")).toHaveLength(2)
    fireEvent.click(screen.getByRole("button", { name: /Columns/ }))
    expect(screen.queryByText("Temp Members")).toBeNull()
    expect(screen.getByRole("checkbox", { name: "Schedule" })).toBeTruthy()
  })
})
