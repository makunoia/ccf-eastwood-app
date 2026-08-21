import { existsSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { clusterSurface, eventSurface } from "@/lib/breakouts/owner"

/**
 * Regression: clicking a table on a Collab day's Breakouts screen 404'd.
 *
 * `BreakoutGroupsTable` builds its row link as `${surface.basePath}/breakouts/
 * ${id}`, which is right — but the detail route existed only under the event
 * workspace, so the cluster surface pointed at a page nobody had written. The
 * table components are shared across both surfaces; the routes they link to
 * have to be too.
 *
 * A filesystem assertion rather than a render test because that is exactly what
 * was missing: the App Router resolves these by path, and no amount of
 * component-level testing would have noticed the absent file.
 */
const APP = path.join(process.cwd(), "app", "(event)")

/** `/event/<id>` → `app/(event)/event/[id]`, `/cluster/<id>` → `.../cluster/[id]`. */
function routeDir(basePath: string) {
  const [, segment] = basePath.split("/")
  return path.join(APP, segment, "[id]")
}

describe("breakout surfaces have the routes their links point at", () => {
  const surfaces = [
    ["event", eventSurface("evt-1")],
    ["cluster", clusterSurface("clu-1")],
  ] as const

  for (const [name, surface] of surfaces) {
    it(`${name}: the breakouts list route exists`, () => {
      expect(existsSync(path.join(routeDir(surface.basePath), "breakouts", "page.tsx"))).toBe(true)
    })

    it(`${name}: a group's detail route exists`, () => {
      expect(
        existsSync(path.join(routeDir(surface.basePath), "breakouts", "[groupId]", "page.tsx"))
      ).toBe(true)
    })
  }
})
