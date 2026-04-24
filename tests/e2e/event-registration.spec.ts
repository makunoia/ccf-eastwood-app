import { test, expect } from "@playwright/test"

/**
 * E2E tests for /events/[id]/register
 *
 * Tests that don't require seeded data:
 *   - 404 for non-existent event IDs
 *
 * Tests that require a running app + seeded data are marked with test.skip
 * and should be filled in with real event IDs from your test environment.
 */

test.describe("Event Registration page", () => {
  test("returns 404 for a non-existent event ID", async ({ page }) => {
    const response = await page.goto("/events/non-existent-id/register")
    // Next.js notFound() renders a 404 page — the HTTP status is 404
    expect(response?.status()).toBe(404)
  })

  test("returns 404 for a random-looking but non-existent event ID", async ({ page }) => {
    const fakeId = "clzzzzzzzzzzzzzzzzzzzz"
    const response = await page.goto(`/events/${fakeId}/register`)
    expect(response?.status()).toBe(404)
  })

  // Fill in a real event ID from your seeded test environment to run these.
  test.skip("renders event name and registration form for a valid OneTime event", async ({ page }) => {
    const eventId = "REPLACE_WITH_REAL_EVENT_ID"
    await page.goto(`/events/${eventId}/register`)
    await expect(page.locator("h1")).toBeVisible()
    await expect(page.getByRole("textbox", { name: /mobile/i })).toBeVisible()
    await expect(page.getByRole("button", { name: /register/i })).toBeVisible()
  })

  test.skip("shows price when event has a fee", async ({ page }) => {
    const paidEventId = "REPLACE_WITH_PAID_EVENT_ID"
    await page.goto(`/events/${paidEventId}/register`)
    // Price in PH Peso format
    await expect(page.locator("text=₱")).toBeVisible()
  })

  test.skip("shows life stage selector for Recurring events", async ({ page }) => {
    const recurringEventId = "REPLACE_WITH_RECURRING_EVENT_ID"
    await page.goto(`/events/${recurringEventId}/register`)
    await expect(page.getByLabel(/life stage/i)).toBeVisible()
  })
})
