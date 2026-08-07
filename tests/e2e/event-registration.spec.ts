import { test as base, expect } from "@playwright/test"
import { test } from "./fixtures/registration-event"

/**
 * E2E tests for /events/[id]/register
 *
 * The data-driven tests seed their own event via the `dgroupEvent` fixture, which
 * runs against the local test DB pinned in playwright.config.ts.
 */

base.describe("Event Registration page — unseeded", () => {
  base("returns 404 for a non-existent event ID", async ({ page }) => {
    const response = await page.goto("/events/non-existent-id/register")
    // Next.js notFound() renders a 404 page — the HTTP status is 404
    expect(response?.status()).toBe(404)
  })

  base("returns 404 for a random-looking but non-existent event ID", async ({ page }) => {
    const fakeId = "clzzzzzzzzzzzzzzzzzzzz"
    const response = await page.goto(`/events/${fakeId}/register`)
    expect(response?.status()).toBe(404)
  })
})

test.describe("Event Registration page", () => {
  test("renders the event name and the first step of the form", async ({ page, dgroupEvent }) => {
    await page.goto(dgroupEvent.registerPath)

    await expect(page.getByRole("heading", { name: dgroupEvent.name })).toBeVisible()
    await expect(page.getByLabel("First Name")).toBeVisible()
    await expect(page.getByLabel("Last Name")).toBeVisible()
    await expect(page.getByRole("button", { name: "Next", exact: true })).toBeVisible()
  })

  test("advances from Personal Information to DGroup Info", async ({ page, dgroupEvent }) => {
    await page.goto(dgroupEvent.registerPath)
    await page.getByLabel("First Name").fill("Juan")
    await page.getByLabel("Last Name").fill("dela Cruz")
    await page.getByRole("button", { name: "Next", exact: true }).click()

    await expect(page.getByText("Step 2 of 2")).toBeVisible()
    await expect(page.getByText("DGroup Info")).toBeVisible()
  })
})
