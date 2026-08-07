import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { createMinistry, updateMinistry } from "@/app/(dashboard)/ministries/actions"
import { updateEventBranding } from "@/app/(dashboard)/events/branding-actions"

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "LifeStage", "Ministry", "Event", "EventMinistry" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

describe("CCF-70 — Customizable theme for Ministries and Events", () => {
  describe("unit", () => {
    it("ministrySchema accepts valid hex colors", async () => {
      const { ministrySchema } = await import("@/lib/validations/ministry")
      const result = ministrySchema.safeParse({
        name: "Across",
        themeColorPrimary: "#4F46E5",
        themeColorSecondary: "#7C3AED",
        themeColorAccent: "#EC4899",
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.themeColorPrimary).toBe("#4F46E5")
      }
    })

    it("ministrySchema rejects invalid hex colors", async () => {
      const { ministrySchema } = await import("@/lib/validations/ministry")
      const result = ministrySchema.safeParse({
        name: "Across",
        themeColorPrimary: "notacolor",
      })
      expect(result.success).toBe(false)
    })

    it("ministrySchema transforms empty string color to null", async () => {
      const { ministrySchema } = await import("@/lib/validations/ministry")
      const result = ministrySchema.safeParse({
        name: "Across",
        themeColorPrimary: "",
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.themeColorPrimary).toBeNull()
      }
    })
  })

  describe("integration", () => {
    it("createMinistry persists branding fields", async () => {
      const lifeStage = await db.lifeStage.create({
        data: { name: "Young Adults", order: 1 },
      })

      const result = await createMinistry({
        name: "Across",
        lifeStageId: lifeStage.id,
        description: "Young adults ministry",
        logoUrl: "https://example.com/logo.png",
        themeColorPrimary: "#4F46E5",
        themeColorSecondary: "#7C3AED",
        themeColorAccent: "#EC4899",
      })

      expect(result.success).toBe(true)
      if (!result.success) return

      const ministry = await db.ministry.findUnique({ where: { id: result.data.id } })
      expect(ministry?.logoUrl).toBe("https://example.com/logo.png")
      expect(ministry?.themeColorPrimary).toBe("#4F46E5")
      expect(ministry?.themeColorSecondary).toBe("#7C3AED")
      expect(ministry?.themeColorAccent).toBe("#EC4899")
    })

    it("updateMinistry updates branding fields", async () => {
      const ministry = await db.ministry.create({
        data: { name: "Elevate" },
      })

      const result = await updateMinistry(ministry.id, {
        name: "Elevate",
        lifeStageId: "",
        description: "",
        logoUrl: "https://example.com/elevate.png",
        themeColorPrimary: "#10B981",
        themeColorSecondary: "#059669",
        themeColorAccent: "#F59E0B",
      })

      expect(result.success).toBe(true)
      const updated = await db.ministry.findUnique({ where: { id: ministry.id } })
      expect(updated?.logoUrl).toBe("https://example.com/elevate.png")
      expect(updated?.themeColorPrimary).toBe("#10B981")
    })

    it("updateEventBranding persists ministry brand flag and ministryId", async () => {
      const event = await db.event.create({
        data: {
          name: "Connect Camp",
          type: "OneTime",
          startDate: new Date("2026-06-01"),
          endDate: new Date("2026-06-01"),
        },
      })
      const ministry = await db.ministry.create({ data: { name: "Across" } })

      const result = await updateEventBranding(event.id, {
        useMinistryBrand: true,
        brandMinistryId: ministry.id,
        logoUrl: "",
        themeColorPrimary: "",
        themeColorSecondary: "",
        themeColorAccent: "",
      })

      expect(result.success).toBe(true)
      const updated = await db.event.findUnique({ where: { id: event.id } })
      expect(updated?.useMinistryBrand).toBe(true)
      expect(updated?.brandMinistryId).toBe(ministry.id)
    })

    it("updateEventBranding persists custom branding when not using ministry brand", async () => {
      const event = await db.event.create({
        data: {
          name: "Leadership Summit",
          type: "OneTime",
          startDate: new Date("2026-07-01"),
          endDate: new Date("2026-07-01"),
        },
      })

      const result = await updateEventBranding(event.id, {
        useMinistryBrand: false,
        brandMinistryId: "",
        logoUrl: "https://example.com/summit.png",
        themeColorPrimary: "#F97316",
        themeColorSecondary: "#EA580C",
        themeColorAccent: "#FCD34D",
      })

      expect(result.success).toBe(true)
      const updated = await db.event.findUnique({ where: { id: event.id } })
      expect(updated?.useMinistryBrand).toBe(false)
      expect(updated?.logoUrl).toBe("https://example.com/summit.png")
      expect(updated?.themeColorPrimary).toBe("#F97316")
    })
  })

  describe("regression", () => {
    it("ministry without branding still saves successfully", async () => {
      const result = await createMinistry({
        name: "No Brand Ministry",
        lifeStageId: "",
        description: "",
        logoUrl: "",
        themeColorPrimary: "",
        themeColorSecondary: "",
        themeColorAccent: "",
      })
      expect(result.success).toBe(true)
      if (!result.success) return

      const ministry = await db.ministry.findUnique({ where: { id: result.data.id } })
      expect(ministry?.logoUrl).toBeNull()
      expect(ministry?.themeColorPrimary).toBeNull()
    })
  })
})
