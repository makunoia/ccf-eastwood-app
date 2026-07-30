export type BreadcrumbNavItem = { label: string; href: string }

/**
 * How a crumb chain is distributed across the header bar:
 * `leading` renders inline, `hidden` folds into the ⋯ menu, `current` is the
 * (non-link) page. Ancestors are dropped rather than wrapped — the header is a
 * fixed height, so a second line overflows instead of growing the bar.
 */
export type CrumbLayout = {
  leading: BreadcrumbNavItem[]
  hidden: BreadcrumbNavItem[]
  current: BreadcrumbNavItem
}

/** At/above this many crumbs, the desktop bar starts collapsing the middle. */
export const CRUMB_COLLAPSE_THRESHOLD = 4

/** How many ancestors stay inline on desktop once collapsing kicks in. */
const DESKTOP_LEADING_COUNT = 2

/**
 * Splits a crumb chain for one breakpoint. Mobile keeps a single ancestor-menu
 * plus the current page so the bar holds one line at any viewport width;
 * desktop shows the full chain until it gets long, then collapses the middle.
 */
export function layoutCrumbs(
  items: BreadcrumbNavItem[],
  variant: "mobile" | "desktop"
): CrumbLayout | null {
  if (items.length === 0) return null

  const current = items[items.length - 1]
  const ancestors = items.slice(0, -1)

  if (variant === "mobile") {
    return { leading: [], hidden: ancestors, current }
  }

  if (items.length < CRUMB_COLLAPSE_THRESHOLD) {
    return { leading: ancestors, hidden: [], current }
  }

  return {
    leading: ancestors.slice(0, DESKTOP_LEADING_COUNT),
    hidden: ancestors.slice(DESKTOP_LEADING_COUNT),
    current,
  }
}
