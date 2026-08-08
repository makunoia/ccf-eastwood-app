import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { resolve } from "path"

const searchInputSrc = readFileSync(
  resolve(__dirname, "../../components/search-input.tsx"),
  "utf-8"
)

/**
 * CCF-43: Search field should only trigger on Enter or confirm button click,
 * not on every keystroke.
 */
describe("CCF-43", () => {
  describe("unit", () => {
    it("does not use a setTimeout debounce pattern", () => {
      expect(searchInputSrc).not.toMatch(/setTimeout/)
    })

    it("does not fire onChange on every keystroke via useEffect", () => {
      expect(searchInputSrc).not.toMatch(/useEffect[\s\S]*?setTimeout[\s\S]*?\},\s*\[value\]/)
    })

    it("uses a form element to handle Enter key and submit", () => {
      expect(searchInputSrc).toMatch(/onSubmit/)
    })

    it("has a trailing confirm button of type submit", () => {
      expect(searchInputSrc).toMatch(/type="submit"/)
    })
  })

  describe("regression", () => {
    it("does not fire search on every keystroke (debounce pattern is absent)", () => {
      // The old implementation had: useEffect(() => { setTimeout(() => onChange(value), 300) }, [value])
      // This would fire a navigation on every keystroke after 300ms.
      // Asserting the debounce is fully removed.
      expect(searchInputSrc).not.toMatch(/clearTimeout/)
      expect(searchInputSrc).not.toMatch(/setTimeout/)
    })

    it("still has a clear (X) button that resets the search", () => {
      expect(searchInputSrc).toMatch(/IconX/)
      expect(searchInputSrc).toMatch(/clear\(\)/)
    })
  })
})
