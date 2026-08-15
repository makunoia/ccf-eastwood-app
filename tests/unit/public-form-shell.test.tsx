// @vitest-environment jsdom
import * as React from "react"
import { describe, expect, it } from "vitest"
import { render } from "@testing-library/react"

import { PublicFormShell } from "@/components/public-form-shell"
import type { FormTheme } from "@/lib/forms/config"

/**
 * The shell's three header treatments — banner, brand color, and neither.
 *
 * The third one is the regression: an event with no logo and no color used to
 * render the band with *no* background, so the title floated on the page
 * background and the form card's negative margin overlapped nothing. The band
 * now falls back to a `primary` tint (and a monogram in place of the logo), so
 * the overlap composition holds for unbranded events too.
 */

function theme(overrides: Partial<FormTheme> = {}): FormTheme {
  return {
    title: "Youth Night Registration",
    description: "Youth · March 3, 2026",
    logoUrl: null,
    bannerUrl: null,
    primaryColor: null,
    ...overrides,
  }
}

function band(container: HTMLElement) {
  const el = container.querySelector<HTMLElement>("h1")?.closest("div")?.parentElement
  if (!el) throw new Error("header band not found")
  return el
}

describe("PublicFormShell — unbranded", () => {
  it("tints the header band so the card still overlaps a colored surface", () => {
    const { container } = render(
      <PublicFormShell theme={theme()} alt="Youth Night">
        <div data-slot="card">form</div>
      </PublicFormShell>
    )

    expect(band(container).className).toContain("bg-primary/[0.07]")
  })

  it("stands a monogram in for the missing logo", () => {
    const { getByText } = render(
      <PublicFormShell theme={theme()} alt="Youth Night">
        <div data-slot="card">form</div>
      </PublicFormShell>
    )

    expect(getByText("Y")).toBeTruthy()
  })

  it("keeps the title and description in foreground ink, not white", () => {
    const { container } = render(
      <PublicFormShell theme={theme()} alt="Youth Night">
        <div data-slot="card">form</div>
      </PublicFormShell>
    )

    expect(container.querySelector("h1")?.className).toContain("text-foreground")
    expect(container.querySelector("h1")?.className).not.toContain("text-white")
  })
})

describe("PublicFormShell — branded", () => {
  it("paints the band with the brand color and drops the tint fallback", () => {
    const { container } = render(
      <PublicFormShell theme={theme({ primaryColor: "#0a7d4b" })} alt="Youth Night">
        <div data-slot="card">form</div>
      </PublicFormShell>
    )

    const header = band(container)
    expect(header.style.backgroundColor).toBe("rgb(10, 125, 75)")
    expect(header.className).not.toContain("bg-primary/[0.07]")
  })

  it("never shows the monogram once there is a background to read against", () => {
    const { queryByText } = render(
      <PublicFormShell theme={theme({ primaryColor: "#0a7d4b" })} alt="Youth Night">
        <div data-slot="card">form</div>
      </PublicFormShell>
    )

    expect(queryByText("Y")).toBeNull()
  })

  it("renders the logo instead of the monogram when the event has one", () => {
    const { container, queryByText } = render(
      <PublicFormShell theme={theme({ logoUrl: "/logo.png" })} alt="Youth Night">
        <div data-slot="card">form</div>
      </PublicFormShell>
    )

    expect(container.querySelector("img[alt='Youth Night']")).toBeTruthy()
    expect(queryByText("Y")).toBeNull()
  })

  it("lays a scrim over the banner image and skips the solid color", () => {
    const { container } = render(
      <PublicFormShell
        theme={theme({ bannerUrl: "/banner.jpg", primaryColor: "#0a7d4b" })}
        alt="Youth Night"
      >
        <div data-slot="card">form</div>
      </PublicFormShell>
    )

    expect(container.querySelector("img[alt='']")).toBeTruthy()
    expect(container.querySelector(".bg-black\\/50")).toBeTruthy()
    expect(band(container).style.backgroundColor).toBe("")
  })
})
