// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest"
import { releaseBodyPointerEvents } from "@/lib/dom/release-body-pointer-events"

/**
 * CCF-145 — Radix's DismissableLayer can strand `body { pointer-events: none }`
 * when overlapping layers unmount out of order, which kills every tap on the page
 * until a window resize force-closes the stuck layer. These pin the release guard.
 */

function lockBody() {
  document.body.style.pointerEvents = "none"
}

beforeEach(() => {
  document.body.removeAttribute("style")
  document.body.innerHTML = ""
})

describe("releaseBodyPointerEvents", () => {
  it("drops a stale lock when no layer is left in the DOM", () => {
    lockBody()

    expect(releaseBodyPointerEvents(document)).toBe(true)
    expect(document.body.style.pointerEvents).toBe("")
  })

  it("leaves the lock alone while a popper-positioned layer is still mounted", () => {
    lockBody()
    const layer = document.createElement("div")
    layer.setAttribute("data-radix-popper-content-wrapper", "")
    document.body.appendChild(layer)

    expect(releaseBodyPointerEvents(document)).toBe(false)
    expect(document.body.style.pointerEvents).toBe("none")
  })

  it("leaves the lock alone while an item-aligned Select is still mounted", () => {
    // Item-aligned Select content is not wrapped in a popper container, so it has
    // to be matched on its own slot or we'd release under a genuinely open Select.
    lockBody()
    const content = document.createElement("div")
    content.setAttribute("data-slot", "select-content")
    document.body.appendChild(content)

    expect(releaseBodyPointerEvents(document)).toBe(false)
    expect(document.body.style.pointerEvents).toBe("none")
  })

  it("leaves the lock alone while a dialog is open", () => {
    lockBody()
    const dialog = document.createElement("div")
    dialog.setAttribute("role", "dialog")
    document.body.appendChild(dialog)

    expect(releaseBodyPointerEvents(document)).toBe(false)
    expect(document.body.style.pointerEvents).toBe("none")
  })

  it("releases once the last layer has gone", () => {
    lockBody()
    const layer = document.createElement("div")
    layer.setAttribute("data-radix-popper-content-wrapper", "")
    document.body.appendChild(layer)

    expect(releaseBodyPointerEvents(document)).toBe(false)

    layer.remove()

    expect(releaseBodyPointerEvents(document)).toBe(true)
    expect(document.body.style.pointerEvents).toBe("")
  })

  it("is a no-op when the body was never locked", () => {
    document.body.style.pointerEvents = "auto"

    expect(releaseBodyPointerEvents(document)).toBe(true)
    expect(document.body.style.pointerEvents).toBe("auto")
  })

  it("does not touch unrelated inline body styles", () => {
    document.body.style.overflow = "hidden"
    lockBody()

    releaseBodyPointerEvents(document)

    expect(document.body.style.pointerEvents).toBe("")
    expect(document.body.style.overflow).toBe("hidden")
  })

  it("is idempotent", () => {
    lockBody()

    expect(releaseBodyPointerEvents(document)).toBe(true)
    expect(releaseBodyPointerEvents(document)).toBe(true)
    expect(document.body.style.pointerEvents).toBe("")
  })

  it("tolerates being called without a document", () => {
    expect(releaseBodyPointerEvents(undefined)).toBe(true)
  })
})
