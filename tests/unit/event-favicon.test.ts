import { describe, expect, it } from "vitest"
import { eventIcons } from "@/lib/metadata"
import { resolveEventBrand, type EventBrandInput } from "@/lib/forms/event-brand"

describe("eventIcons", () => {
  it("returns an icon entry pointing at the logo when present", () => {
    expect(eventIcons("https://blob.example/logo.png")).toEqual({
      icon: "https://blob.example/logo.png",
    })
  })

  it("returns undefined with no logo so pages fall back to the app favicon", () => {
    expect(eventIcons(null)).toBeUndefined()
    expect(eventIcons("")).toBeUndefined()
  })
})

describe("favicon logo resolution", () => {
  const base: EventBrandInput = {
    useMinistryBrand: false,
    brandMinistryId: null,
    logoUrl: "https://blob.example/event.png",
    themeColorPrimary: null,
    ministries: [
      {
        ministry: {
          id: "min-1",
          logoUrl: "https://blob.example/ministry.png",
          themeColorPrimary: null,
        },
      },
    ],
  }

  it("uses the event's own logo by default", () => {
    expect(eventIcons(resolveEventBrand(base).logoUrl)).toEqual({
      icon: "https://blob.example/event.png",
    })
  })

  it("falls back to the ministry logo when the brand toggle is on", () => {
    const branded: EventBrandInput = {
      ...base,
      useMinistryBrand: true,
      brandMinistryId: "min-1",
    }
    expect(eventIcons(resolveEventBrand(branded).logoUrl)).toEqual({
      icon: "https://blob.example/ministry.png",
    })
  })
})
