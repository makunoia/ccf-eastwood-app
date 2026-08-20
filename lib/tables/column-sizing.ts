/**
 * The shared width vocabulary every table column speaks.
 *
 * Before this existed, a column was as wide as whatever happened to be in it:
 * `components/ui/table.tsx` sets `whitespace-nowrap` on every head and cell and
 * the table ran at the browser default `table-layout: auto`, so "Email" was one
 * width on Members, another on Guests, and a third on Registrants. The handful
 * of columns that did pin a width picked from four different conventions for
 * "narrow icon column" alone (`w-0`, `w-8`, `w-10`, `w-14`).
 *
 * A column now names what it *is* — `width: "phone"` — and every table that
 * shows a phone number renders it identically.
 */

/**
 * `size` is the *share* of the table a column claims, not a pixel width; `min`
 * is the floor below which the table stops shrinking and its container scrolls.
 *
 * Two columns carrying the same token therefore always come out the same width
 * as each other, and two tables built from similar tokens line up — which is
 * the actual complaint this vocabulary answers.
 *
 * There is deliberately no ceiling. An earlier version clamped each column to a
 * maximum, which meant a three-column table left a few hundred pixels of slack
 * that the browser then redistributed *equally* across the columns — distorting
 * the very proportions the tokens exist to state. Proportional with a floor
 * always fills the table and always keeps the declared ratios.
 *
 * The floors are tight on purpose: the narrowest each kind of value is still
 * readable, not the width it would prefer. They are summed into the table's
 * `min-width`, so a generous floor doesn't buy a roomier column, it buys a
 * horizontal scrollbar on a screen that could have shown everything.
 */
export const COLUMN_WIDTHS = {
  /** Checkbox, expand chevron — fixed, never flexes. */
  micro: { size: 44, min: 44, fixed: true },
  /**
   * The trailing row-actions "⋯". Wide enough for the 32px icon trigger *plus*
   * its gutter — on `micro` the button was 32px in a 12px content box, so it
   * overflowed the cell, got clipped by `truncate`, and lost the right edge of
   * its own hit area against the card border.
   */
  actions: { size: 52, min: 52, fixed: true },
  /** Counts, Yes/No, short numerics. */
  narrow: { size: 88, min: 64 },
  /** A single badge. */
  status: { size: 140, min: 96 },
  /** A formatted date, optionally with a time beneath it. */
  date: { size: 132, min: 104 },
  /** `"+63 XXX XXX XXXX"` is a fixed shape and shouldn't ever wrap or clip. */
  phone: { size: 168, min: 140 },
  /** A person's or group's name. */
  name: { size: 220, min: 140 },
  email: { size: 240, min: 150 },
  /** The default for free text with no stronger claim. */
  text: { size: 200, min: 110 },
  /** Notes, addresses — the column that should absorb the most space. */
  wide: { size: 320, min: 160 },
} as const

export type ColumnWidth = keyof typeof COLUMN_WIDTHS

/** The token a column falls back to when it names none. */
export const DEFAULT_COLUMN_WIDTH: ColumnWidth = "text"

export function columnWidth(width: ColumnWidth | undefined) {
  return COLUMN_WIDTHS[width ?? DEFAULT_COLUMN_WIDTH]
}

/**
 * The narrowest the table may render before its container starts scrolling.
 *
 * `table-fixed` distributes space proportionally, which is what makes columns
 * consistent — but left alone it will also squeeze a name column to nothing on a
 * narrow screen. Pinning the table's `min-width` to the sum of the visible
 * columns' minimums means it degrades into a horizontal scroll instead.
 */
export function tableMinWidth(widths: (ColumnWidth | undefined)[]): number {
  return widths.reduce<number>((total, width) => total + columnWidth(width).min, 0)
}

/** A column that never flexes: the checkbox, the chevron, the "⋯" menu. */
function isFixed(width: ColumnWidth | undefined): boolean {
  return "fixed" in columnWidth(width)
}

/**
 * The `<col>` width for each column, as CSS.
 *
 * `size` is a *proportion*, not a pixel width — handing the browser literal
 * pixels under `table-fixed` makes the table exactly as wide as their sum, so a
 * seven-column table overflows a 1400px screen even though every column would
 * have fitted comfortably. Instead: fixed columns take their exact width, and
 * the rest split what remains in proportion to their `size`, never dropping
 * below their own floor.
 *
 * The floor is doubled up by the table's `min-width` (see `tableMinWidth`), so
 * a container narrower than the sum of the floors scrolls rather than crushing.
 */
export function columnStyles(
  widths: (ColumnWidth | undefined)[],
): { width: string }[] {
  const fixedTotal = widths
    .filter(isFixed)
    .reduce((total, width) => total + columnWidth(width).size, 0)

  const flexTotal = widths
    .filter((w) => !isFixed(w))
    .reduce((total, width) => total + columnWidth(width).size, 0)

  return widths.map((width) => {
    const w = columnWidth(width)
    if (isFixed(width) || flexTotal === 0) return { width: `${w.size}px` }
    const share = w.size / flexTotal
    return {
      width: `max(${w.min}px, calc((100% - ${fixedTotal}px) * ${share.toFixed(4)}))`,
    }
  })
}
