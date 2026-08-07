/**
 * Workaround for a leak in @radix-ui/react-dismissable-layer (CCF-145).
 *
 * Radix locks the page while a modal layer is open by setting
 * `document.body.style.pointerEvents = "none"`, and restores the previous value
 * from a *module-level* variable gated on the size of a Set of live layers:
 *
 *   if (layersWithOutsidePointerEventsDisabled.size === 0) {
 *     originalBodyPointerEvents = body.style.pointerEvents
 *     body.style.pointerEvents = "none"
 *   }
 *   // …release, in a different effect's cleanup:
 *   if (layersWithOutsidePointerEventsDisabled.size === 1) {
 *     body.style.pointerEvents = originalBodyPointerEvents
 *   }
 *
 * The `delete` from that Set lives in a separate, later effect, so the release is
 * order-sensitive when overlapping layers unmount together — which is exactly what
 * a wizard step change does when it tears down a subtree containing a layer that is
 * still mid-close. When the accounting slips, the body keeps `pointer-events: none`
 * and every click on the page is swallowed.
 *
 * The symptom is unmistakable: the page only comes back after the window is
 * resized, because Radix's Select registers `window.addEventListener("resize", close)`
 * on itself — the one code path in the stack that force-closes a stuck layer.
 *
 * Radix Select hardcodes `disableOutsidePointerEvents: true` and exposes no `modal`
 * prop, so the lock can't be opted out of there. Instead we release it explicitly:
 * once no Radix layer is left in the DOM, a lock on the body is by definition stale.
 */

/**
 * Selectors for layers that legitimately hold the body lock while mounted. If any
 * of these is present we leave the body alone — releasing early would break a real
 * open overlay's outside-click handling.
 *
 * `[data-radix-popper-content-wrapper]` covers popper-positioned Select, Popover,
 * DropdownMenu and Tooltip content; item-aligned Select content is not wrapped, so
 * it is matched on its own slot.
 */
const LIVE_LAYER_SELECTOR = [
  "[data-radix-popper-content-wrapper]",
  '[data-slot="select-content"]',
  '[data-slot="dropdown-menu-content"]',
  '[role="dialog"]',
  '[role="alertdialog"]',
  "[data-vaul-drawer]",
].join(",")

/**
 * Drop a stale `pointer-events: none` from `<body>`.
 *
 * @returns `true` when nothing further is needed — either the body was never
 * locked, or the lock was stale and has been released. `false` means a layer is
 * still mounted and the caller should check again shortly.
 */
export function releaseBodyPointerEvents(doc: Document | undefined = globalThis.document): boolean {
  if (!doc?.body) return true
  if (doc.body.style.pointerEvents !== "none") return true
  if (doc.querySelector(LIVE_LAYER_SELECTOR)) return false

  doc.body.style.removeProperty("pointer-events")
  return true
}

/** How long to keep watching for the last layer to finish its exit animation. */
const RETRY_INTERVAL_MS = 50
const MAX_ATTEMPTS = 10

let pending = false

/**
 * Schedule a {@link releaseBodyPointerEvents} check, retrying briefly so the last
 * layer has time to finish its exit animation before we decide the lock is stale.
 *
 * Safe to call redundantly — overlapping calls collapse into the one in flight.
 */
export function scheduleBodyPointerEventsRelease(): void {
  if (typeof document === "undefined" || pending) return
  pending = true

  let attempts = 0
  const tick = () => {
    attempts += 1
    if (releaseBodyPointerEvents() || attempts >= MAX_ATTEMPTS) {
      pending = false
      return
    }
    setTimeout(tick, RETRY_INTERVAL_MS)
  }

  setTimeout(tick, 0)
}
