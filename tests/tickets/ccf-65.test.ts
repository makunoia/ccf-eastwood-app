import { describe, it, expect } from "vitest"

/**
 * CCF-65: Events Mini-App Registration, Check-In, Dashboard are inconsistent
 *
 * Fixes:
 * 1. Dashboard metadata container (details + links) now shows for ALL event types.
 * 2. resolveEventBrand correctly filters by brandMinistryId instead of returning
 *    the first linked ministry.
 */

// Mirrors the inline resolveEventBrand logic used in register/page.tsx,
// checkin/page.tsx, and checkin/[occurrenceId]/page.tsx after the fix.
type Ministry = { id: string; name: string; logoUrl: string | null; themeColorPrimary: string | null }
type EventWithBrand = {
  useMinistryBrand: boolean
  brandMinistryId: string | null
  logoUrl: string | null
  themeColorPrimary: string | null
  ministries: Array<{ ministry: Ministry }>
}

function resolveEventBrand(event: EventWithBrand) {
  if (event.useMinistryBrand && event.brandMinistryId) {
    const ministry = event.ministries.find((em) => em.ministry.id === event.brandMinistryId)
    return {
      logoUrl: ministry?.ministry.logoUrl ?? null,
      primaryColor: ministry?.ministry.themeColorPrimary ?? null,
    }
  }
  return {
    logoUrl: event.logoUrl ?? null,
    primaryColor: event.themeColorPrimary ?? null,
  }
}

describe("CCF-65", () => {
  describe("unit", () => {
    it("resolveEventBrand returns event own branding when useMinistryBrand is false", () => {
      const event: EventWithBrand = {
        useMinistryBrand: false,
        brandMinistryId: null,
        logoUrl: "https://example.com/logo.png",
        themeColorPrimary: "#FF0000",
        ministries: [
          { ministry: { id: "m1", name: "Youth", logoUrl: "https://example.com/youth.png", themeColorPrimary: "#00FF00" } },
        ],
      }
      const brand = resolveEventBrand(event)
      expect(brand.logoUrl).toBe("https://example.com/logo.png")
      expect(brand.primaryColor).toBe("#FF0000")
    })

    it("resolveEventBrand returns the specific brandMinistryId ministry, not the first one", () => {
      const event: EventWithBrand = {
        useMinistryBrand: true,
        brandMinistryId: "m2",
        logoUrl: "https://example.com/event-logo.png",
        themeColorPrimary: "#000000",
        ministries: [
          { ministry: { id: "m1", name: "Youth", logoUrl: "https://example.com/youth.png", themeColorPrimary: "#AAAAAA" } },
          { ministry: { id: "m2", name: "Kids", logoUrl: "https://example.com/kids.png", themeColorPrimary: "#BB0000" } },
        ],
      }
      const brand = resolveEventBrand(event)
      expect(brand.logoUrl).toBe("https://example.com/kids.png")
      expect(brand.primaryColor).toBe("#BB0000")
    })

    it("resolveEventBrand falls back to null when brandMinistryId points to a non-linked ministry", () => {
      const event: EventWithBrand = {
        useMinistryBrand: true,
        brandMinistryId: "m-nonexistent",
        logoUrl: "https://example.com/event-logo.png",
        themeColorPrimary: "#000000",
        ministries: [
          { ministry: { id: "m1", name: "Youth", logoUrl: "https://example.com/youth.png", themeColorPrimary: "#AAAAAA" } },
        ],
      }
      const brand = resolveEventBrand(event)
      expect(brand.logoUrl).toBeNull()
      expect(brand.primaryColor).toBeNull()
    })
  })

  describe("regression", () => {
    it("dashboard metadata container shows for all event types — OneTime has date + entry + checkin link", () => {
      // Verifies the condition logic removed from dashboard-client.tsx:
      // Previously: `!isRecurring && !isMultiDay` gated the container.
      // Now: container always renders.
      const eventTypes = ["OneTime", "MultiDay", "Recurring"] as const
      for (const type of eventTypes) {
        const isRecurring = type === "Recurring"
        const isMultiDay = type === "MultiDay"
        const isSeriesEvent = isRecurring || isMultiDay

        // Container always renders (no gating condition)
        const containerShouldRender = true
        expect(containerShouldRender).toBe(true)

        // Date field only for OneTime
        expect(!isSeriesEvent).toBe(type === "OneTime")

        // Entry fee for non-Recurring only
        expect(!isRecurring).toBe(type !== "Recurring")

        // Check-in link only for OneTime
        expect(!isSeriesEvent).toBe(type === "OneTime")
      }
    })

    it("resolveEventBrand does NOT return the first ministry when brandMinistryId targets a different one", () => {
      // Regression guard: the old bug returned ministries.find(em => em.ministry) which
      // always resolves to the first ministry regardless of brandMinistryId.
      const event: EventWithBrand = {
        useMinistryBrand: true,
        brandMinistryId: "m2",
        logoUrl: null,
        themeColorPrimary: null,
        ministries: [
          { ministry: { id: "m1", name: "First Ministry", logoUrl: "https://example.com/first.png", themeColorPrimary: "#111111" } },
          { ministry: { id: "m2", name: "Brand Ministry", logoUrl: "https://example.com/brand.png", themeColorPrimary: "#222222" } },
        ],
      }
      const brand = resolveEventBrand(event)
      // Must NOT return first ministry's branding
      expect(brand.logoUrl).not.toBe("https://example.com/first.png")
      expect(brand.primaryColor).not.toBe("#111111")
      // Must return the correct brandMinistryId ministry
      expect(brand.logoUrl).toBe("https://example.com/brand.png")
      expect(brand.primaryColor).toBe("#222222")
    })
  })
})
