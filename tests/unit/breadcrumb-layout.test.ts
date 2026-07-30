import { describe, it, expect } from "vitest"
import { layoutCrumbs, CRUMB_COLLAPSE_THRESHOLD, type BreadcrumbNavItem } from "@/lib/breadcrumbs"

const crumb = (label: string): BreadcrumbNavItem => ({ label, href: `/${label.toLowerCase()}` })

// The real chain behind the mobile wrapping bug: a long event name sits in the
// middle of an event-workspace detail route.
const EVENT_DETAIL: BreadcrumbNavItem[] = [
  { label: "Events", href: "/events" },
  { label: "Youth Camp Registration Weekend 2026", href: "/event/evt_1" },
  { label: "Registrants", href: "/event/evt_1/registrants" },
  { label: "Juan Dela Cruz", href: "/event/evt_1/registrants/reg_1" },
]

describe("layoutCrumbs", () => {
  it("returns null for an empty chain", () => {
    expect(layoutCrumbs([], "mobile")).toBeNull()
    expect(layoutCrumbs([], "desktop")).toBeNull()
  })

  describe("mobile", () => {
    it("renders no inline ancestors, so the bar can never exceed one line", () => {
      const layout = layoutCrumbs(EVENT_DETAIL, "mobile")!
      expect(layout.leading).toEqual([])
      expect(layout.current.label).toBe("Juan Dela Cruz")
    })

    it("folds every ancestor into the menu, in order", () => {
      const layout = layoutCrumbs(EVENT_DETAIL, "mobile")!
      expect(layout.hidden.map((i) => i.label)).toEqual([
        "Events",
        "Youth Camp Registration Weekend 2026",
        "Registrants",
      ])
    })

    it("shows only the page (no menu) at the top level", () => {
      const layout = layoutCrumbs([crumb("Members")], "mobile")!
      expect(layout.hidden).toEqual([])
      expect(layout.leading).toEqual([])
      expect(layout.current.label).toBe("Members")
    })

    it("collapses even a two-crumb chain, since one long label alone can overflow", () => {
      const layout = layoutCrumbs([crumb("Events"), crumb("Youth Camp")], "mobile")!
      expect(layout.leading).toEqual([])
      expect(layout.hidden.map((i) => i.label)).toEqual(["Events"])
    })
  })

  describe("desktop", () => {
    it("keeps the full chain inline below the collapse threshold", () => {
      const items = [crumb("Events"), crumb("Youth Camp"), crumb("Registrants")]
      expect(items.length).toBeLessThan(CRUMB_COLLAPSE_THRESHOLD)
      const layout = layoutCrumbs(items, "desktop")!
      expect(layout.leading.map((i) => i.label)).toEqual(["Events", "Youth Camp"])
      expect(layout.hidden).toEqual([])
      expect(layout.current.label).toBe("Registrants")
    })

    it("collapses the middle at the threshold, keeping the first two ancestors", () => {
      const layout = layoutCrumbs(EVENT_DETAIL, "desktop")!
      expect(layout.leading.map((i) => i.label)).toEqual([
        "Events",
        "Youth Camp Registration Weekend 2026",
      ])
      expect(layout.hidden.map((i) => i.label)).toEqual(["Registrants"])
      expect(layout.current.label).toBe("Juan Dela Cruz")
    })

    it("grows the menu, not the inline row, as the chain deepens", () => {
      const deep = [...EVENT_DETAIL, crumb("Edit")]
      const layout = layoutCrumbs(deep, "desktop")!
      expect(layout.leading).toHaveLength(2)
      expect(layout.hidden.map((i) => i.label)).toEqual([
        "Registrants",
        "Juan Dela Cruz",
      ])
      expect(layout.current.label).toBe("Edit")
    })

    it("shows only the page at the top level", () => {
      const layout = layoutCrumbs([crumb("Members")], "desktop")!
      expect(layout.leading).toEqual([])
      expect(layout.hidden).toEqual([])
    })
  })

  it("never drops or duplicates a crumb, in either variant", () => {
    for (const variant of ["mobile", "desktop"] as const) {
      for (let size = 1; size <= 6; size++) {
        const items = Array.from({ length: size }, (_, i) => crumb(`Level${i}`))
        const { leading, hidden, current } = layoutCrumbs(items, variant)!
        expect([...leading, ...hidden, current].map((i) => i.label)).toEqual(
          items.map((i) => i.label)
        )
      }
    }
  })
})
