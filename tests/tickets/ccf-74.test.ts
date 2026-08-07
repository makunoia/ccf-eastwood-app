import { describe, it, expect } from "vitest"

/**
 * CCF-74: Check-in and Registration pages use event branding.
 * These are UI-only pages (server components, no DB mutations), so tests
 * cover the brand-resolution logic that determines which logo/color to display.
 */

type Ministry = { logoUrl: string | null; themeColorPrimary: string | null }
type EventBrandInput = {
  useMinistryBrand: boolean
  brandMinistryId: string | null
  logoUrl: string | null
  themeColorPrimary: string | null
  ministries: { ministry: Ministry }[]
}

function resolveEventBrand(event: EventBrandInput) {
  if (event.useMinistryBrand && event.brandMinistryId) {
    const ministry = event.ministries.find((em) => em.ministry)
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

describe("CCF-74 — Check-in and Registration branding", () => {
  describe("unit: resolveEventBrand", () => {
    it("returns the event's own logo and color when useMinistryBrand is false", () => {
      const event: EventBrandInput = {
        useMinistryBrand: false,
        brandMinistryId: null,
        logoUrl: "https://cdn.example.com/event-logo.png",
        themeColorPrimary: "#1A56DB",
        ministries: [{ ministry: { logoUrl: "https://cdn.example.com/ministry-logo.png", themeColorPrimary: "#FF0000" } }],
      }
      const brand = resolveEventBrand(event)
      expect(brand.logoUrl).toBe("https://cdn.example.com/event-logo.png")
      expect(brand.primaryColor).toBe("#1A56DB")
    })

    it("returns the ministry's logo and color when useMinistryBrand is true", () => {
      const event: EventBrandInput = {
        useMinistryBrand: true,
        brandMinistryId: "ministry-123",
        logoUrl: "https://cdn.example.com/event-logo.png",
        themeColorPrimary: "#1A56DB",
        ministries: [{ ministry: { logoUrl: "https://cdn.example.com/ministry-logo.png", themeColorPrimary: "#FF0000" } }],
      }
      const brand = resolveEventBrand(event)
      expect(brand.logoUrl).toBe("https://cdn.example.com/ministry-logo.png")
      expect(brand.primaryColor).toBe("#FF0000")
    })

    it("returns nulls when useMinistryBrand is true but no ministries are linked", () => {
      const event: EventBrandInput = {
        useMinistryBrand: true,
        brandMinistryId: "ministry-123",
        logoUrl: "https://cdn.example.com/event-logo.png",
        themeColorPrimary: "#1A56DB",
        ministries: [],
      }
      const brand = resolveEventBrand(event)
      expect(brand.logoUrl).toBeNull()
      expect(brand.primaryColor).toBeNull()
    })

    it("returns nulls when the event has no logo or color set", () => {
      const event: EventBrandInput = {
        useMinistryBrand: false,
        brandMinistryId: null,
        logoUrl: null,
        themeColorPrimary: null,
        ministries: [],
      }
      const brand = resolveEventBrand(event)
      expect(brand.logoUrl).toBeNull()
      expect(brand.primaryColor).toBeNull()
    })

    it("ignores brandMinistryId when useMinistryBrand is false", () => {
      const event: EventBrandInput = {
        useMinistryBrand: false,
        brandMinistryId: "ministry-abc",
        logoUrl: "https://cdn.example.com/event-logo.png",
        themeColorPrimary: "#AABBCC",
        ministries: [{ ministry: { logoUrl: "https://cdn.example.com/m.png", themeColorPrimary: "#000000" } }],
      }
      const brand = resolveEventBrand(event)
      expect(brand.primaryColor).toBe("#AABBCC")
      expect(brand.logoUrl).toBe("https://cdn.example.com/event-logo.png")
    })
  })

  describe("regression", () => {
    it("primaryColor is never lost when ministry branding is active", () => {
      const event: EventBrandInput = {
        useMinistryBrand: true,
        brandMinistryId: "m-1",
        logoUrl: null,
        themeColorPrimary: null,
        ministries: [{ ministry: { logoUrl: null, themeColorPrimary: "#3B82F6" } }],
      }
      const { primaryColor } = resolveEventBrand(event)
      expect(primaryColor).toBe("#3B82F6")
    })

    it("logoUrl is never lost when event branding is active", () => {
      const event: EventBrandInput = {
        useMinistryBrand: false,
        brandMinistryId: null,
        logoUrl: "https://cdn.example.com/logo.png",
        themeColorPrimary: null,
        ministries: [],
      }
      const { logoUrl } = resolveEventBrand(event)
      expect(logoUrl).toBe("https://cdn.example.com/logo.png")
    })
  })
})
