// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { SmallGroupsFilters } from "@/app/(dashboard)/small-groups/small-groups-filters"
import { parseDGroupFilters } from "@/lib/small-groups/list-filters"

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }), usePathname: () => "/small-groups" }))
beforeAll(() => {
  window.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.setPointerCapture ??= () => {}
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

function filters() {
  return <SmallGroupsFilters
    filters={parseDGroupFilters({ status: "Active", city: "Pasig" })}
    lifeStages={[{ id: "ls1", name: "Young Professionals" }]}
    cities={["Pasig", "Quezon City"]} languages={["English", "Tagalog"]}
    parentGroups={[{ id: "g1", name: "Parent Group" }]}
    leaders={[{ id: "m1", name: "Maria Santos" }, { id: "m2", name: "Juan Cruz" }]}
  />
}

describe("DGroup filter controls", () => {
  it("offers the new filters and preserves existing selections when choosing Sunday", () => {
    render(filters())
    fireEvent.click(screen.getByRole("button", { name: /Filters/ }))
    for (const name of ["Meeting day", "Meeting time", "City", "Language", "Leader", "Parent DGroup"]) {
      expect(screen.getByRole("combobox", { name })).toBeTruthy()
    }
    fireEvent.click(screen.getByRole("combobox", { name: "Meeting day" }))
    fireEvent.click(screen.getByRole("option", { name: "Sunday" }))
    const url = replace.mock.calls.at(-1)?.[0] as string
    const params = new URL(url, "https://example.com").searchParams
    expect(params.get("day")).toBe("0")
    expect(params.get("status")).toBe("Active")
    expect(params.get("city")).toBe("Pasig")
  })

  it("searches leaders inside the dropdown and selects a matching leader", () => {
    render(filters())
    fireEvent.click(screen.getByRole("button", { name: /Filters/ }))
    fireEvent.click(screen.getByRole("combobox", { name: "Leader" }))
    const input = screen.getByPlaceholderText("Search leaders...")
    fireEvent.change(input, { target: { value: "santos" } })
    expect(screen.queryByRole("button", { name: "Juan Cruz" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Maria Santos" }))
    const params = new URL(replace.mock.calls.at(-1)?.[0] as string, "https://example.com").searchParams
    expect(params.get("leader")).toBe("m1")
    expect(params.get("status")).toBe("Active")
    expect(params.get("city")).toBe("Pasig")
  })

  it("shows an empty search result and lets All leaders clear just the leader filter", () => {
    render(<SmallGroupsFilters filters={parseDGroupFilters({ leader: "m1", status: "Active" })} lifeStages={[]} cities={[]} languages={[]} parentGroups={[]} leaders={[{ id: "m1", name: "Maria Santos" }]} />)
    fireEvent.click(screen.getByRole("button", { name: /Filters/ }))
    fireEvent.click(screen.getByRole("combobox", { name: "Leader" }))
    fireEvent.change(screen.getByPlaceholderText("Search leaders..."), { target: { value: "unknown" } })
    expect(screen.getByText("No leaders found.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "All leaders" }))
    const params = new URL(replace.mock.calls.at(-1)?.[0] as string, "https://example.com").searchParams
    expect(params.has("leader")).toBe(false)
    expect(params.get("status")).toBe("Active")
  })

  it("clears all filters through the shared Clear action", () => {
    render(filters())
    fireEvent.click(screen.getByRole("button", { name: "Clear" }))
    expect(replace).toHaveBeenLastCalledWith("/small-groups", { scroll: false })
  })
})
