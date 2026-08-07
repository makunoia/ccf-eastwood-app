import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, it, expect } from "vitest"

/**
 * CCF-143 — no opt-out item on the Life Stage or Age Range selects.
 *
 * A copy guard rather than a behavioural test. Both files are ~2,000-line client
 * components and neither select is extracted, so rendering one would mean
 * standing up the whole multi-step form; the thing actually at risk is the
 * `<SelectItem>` quietly coming back in a later edit, and that is what this pins.
 * The round-trip half — an unanswered field still storing null — is covered for
 * real in `tests/integration/form-required-enforcement.test.ts`.
 */

const FILES = [
  "app/events/[id]/register/registration-form.tsx",
  "app/events/[id]/checkin/checkin-board.tsx",
]

/** Every `<SelectItem …>label</SelectItem>` label in a file. */
function selectItemLabels(source: string): string[] {
  return [...source.matchAll(/<SelectItem[^>]*>([\s\S]*?)<\/SelectItem>/g)]
    .map((m) => m[1].replace(/\s+/g, " ").trim())
    .filter((label) => !label.includes("{"))
}

describe.each(FILES)("%s", (file) => {
  const source = readFileSync(path.join(process.cwd(), file), "utf-8")

  it("offers no 'Prefer not to say' option", () => {
    expect(selectItemLabels(source)).not.toContain("Prefer not to say")
  })

  it("offers no 'No preference' option for Life Stage", () => {
    // Check-in's Life Stage carried the same escape hatch under a different
    // label. Work City and Meeting Preference keep theirs — "No preference" is a
    // real answer there, which is why this asserts on the sentinel value the two
    // demographic selects used rather than on the label alone.
    expect(source).not.toMatch(/lifeStageId:\s*v === "(_none|none)"/)
    expect(source).not.toMatch(/ageRangeBucketId:\s*v === "(_none|none)"/)
  })

  it("keeps both selects on the plain empty-string value, so the placeholder shows", () => {
    expect(source).not.toMatch(/value=\{form\.lifeStageId \|\| "_none"\}/)
    expect(source).not.toMatch(/value=\{form\.ageRangeBucketId \|\| "_none"\}/)
  })
})

describe("the opt-outs that stay", () => {
  const source = readFileSync(path.join(process.cwd(), FILES[0]), "utf-8")

  it("leaves Work City and Dietary alone", () => {
    // Scope check: CCF-143 is about the two demographic selects, not every
    // sentinel in the form.
    const labels = selectItemLabels(source)
    expect(labels).toContain("No preference")
    expect(labels).toContain("No restrictions")
  })
})
