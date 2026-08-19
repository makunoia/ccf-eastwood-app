import type * as Recharts from "recharts"

/**
 * Recharts with its charts left out.
 *
 * `ResponsiveContainer` measures its own box on mount. jsdom has no layout
 * engine, so it measures 0×0 — recharts then renders no chart at all (its
 * `validateWidthHeight` bails on a non-positive size) and logs "The width(0) and
 * height(0) of chart should be greater than 0" once per chart, per render.
 *
 * Faking a size through `ResizeObserver` silences that, but only by making every
 * chart build its real SVG — about 5× the cost of rendering a dashboard, for
 * tests that assert on card headers, KPI labels and wrapper classes. So the
 * container is replaced with an empty box instead: the same empty chart bodies
 * these tests already had, without the noise. A test that wants to assert on
 * chart *contents* needs a sized container, not this.
 *
 * `vi.mock` is hoisted above a file's imports, so the call belongs in the test
 * file and has to pull this in from inside the factory:
 *
 *   vi.mock("recharts", async (importOriginal) => {
 *     const { blankCharts } = await import("../stubs/recharts")
 *     return blankCharts(await importOriginal<typeof import("recharts")>())
 *   })
 */
export function blankCharts(actual: typeof Recharts) {
  return {
    ...actual,
    ResponsiveContainer: () => <div data-slot="chart-body" />,
  }
}
