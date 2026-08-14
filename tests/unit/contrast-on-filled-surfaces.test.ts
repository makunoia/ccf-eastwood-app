import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * `text-muted-foreground` on a filled surface fails WCAG AA in light mode.
 *
 * Measured in a real browser against the app's own compiled tokens, painting the
 * colours to a canvas and computing the WCAG ratio from the pixels:
 *
 * | text on…                    | light | dark |
 * |-----------------------------|-------|------|
 * | `background` / `card`       | 4.74  | 7.66 |
 * | `bg-muted` / `bg-secondary` | 4.35  | 5.86 |
 * | `bg-accent`                 | 4.15  | 6.09 |
 *
 * AA wants 4.5:1 for body text, so the token is fine on the page background and
 * fails on every filled surface — the exact gap DESIGN.md's "Contrast Floor Rule"
 * warns about. `text-foreground/60` clears it everywhere (5.06–5.25 light,
 * 6.14–7.04 dark) and still reads a clear step back from full-strength text.
 *
 * This guard is a source scan rather than a render test because the failure is a
 * pairing of two class names, which is visible in the source and cheap to check.
 * It only catches the two on the *same element* — a muted-text child inside a
 * filled parent is the same bug and this won't see it, so it is a floor, not a
 * ceiling.
 *
 * Icons are exempt on purpose: WCAG 1.4.11 asks 3:1 of non-text, and 4.15 clears
 * that. Only text is a defect here.
 */

const ROOTS = ["app", "components"]

/** A filled background applied unconditionally — `hover:`/`focus:`/`data-[…]:` don't count. */
const STATIC_FILL = /(?<![-:[\w])bg-(muted|secondary|accent)(?![-/\w])/
const MUTED_TEXT = /(?<![-:[\w])text-muted-foreground(?![-/\w])/

function tsxFiles(root: string): string[] {
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => join(root, f))
}

describe("muted text is never placed on a filled surface", () => {
  it("no element pairs a static bg-muted/secondary/accent with text-muted-foreground", () => {
    const offenders: string[] = []

    for (const root of ROOTS) {
      for (const file of tsxFiles(root)) {
        const lines = readFileSync(file, "utf8").split("\n")
        lines.forEach((line, i) => {
          // Only look inside a className string, so prose and comments can't trip it.
          for (const [, cls] of line.matchAll(/className=\{?"([^"]*)"/g)) {
            if (STATIC_FILL.test(cls) && MUTED_TEXT.test(cls)) {
              offenders.push(`${file}:${i + 1}`)
            }
          }
        })
      }
    }

    expect(
      offenders,
      `muted text on a filled surface measures 4.15–4.35:1 in light mode, under the 4.5:1 AA floor.\nUse text-foreground/60 instead:\n${offenders.join("\n")}`
    ).toEqual([])
  })

  it("scans a meaningful number of files — guards against the walker silently finding nothing", () => {
    const total = ROOTS.reduce((n, root) => n + tsxFiles(root).length, 0)
    expect(total).toBeGreaterThan(100)
  })
})
