import { describe, it, expect } from "vitest"

/**
 * Ticket verification suite for CCF-44.
 * Topic: Toaster safe-area inset offsets for iOS PWA notch support.
 */
describe("CCF-44", () => {
  describe("regression — Toaster safe-area offsets in app layout", () => {
    it("app/layout.tsx contains safe-area offset prop on Toaster", async () => {
      const { readFileSync } = await import("node:fs")
      const { resolve, join } = await import("node:path")
      const root = resolve(__dirname, "../..")
      const source = readFileSync(join(root, "app/layout.tsx"), "utf8")
      expect(source).toContain('offset="calc(env(safe-area-inset-top) + 16px)"')
    })

    it("app/layout.tsx contains safe-area mobileOffset prop on Toaster", async () => {
      const { readFileSync } = await import("node:fs")
      const { resolve, join } = await import("node:path")
      const root = resolve(__dirname, "../..")
      const source = readFileSync(join(root, "app/layout.tsx"), "utf8")
      expect(source).toContain('mobileOffset="calc(env(safe-area-inset-top) + 16px)"')
    })
  })
})
