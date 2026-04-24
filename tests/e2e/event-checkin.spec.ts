import { test, expect } from "@playwright/test"

/**
 * E2E tests for /events/[id]/checkin
 *
 * Tests that don't require seeded data:
 *   - 404 for non-existent event IDs
 *
 * Tests requiring real event IDs are skipped and annotated.
 */

test.describe("Event Check-in page", () => {
  test("returns 404 for a non-existent event ID", async ({ page }) => {
    const response = await page.goto("/events/non-existent-id/checkin")
    expect(response?.status()).toBe(404)
  })

  test.skip("OneTime event shows the check-in board", async ({ page }) => {
    const oneTimeEventId = "REPLACE_WITH_ONETIME_EVENT_ID"
    await page.goto(`/events/${oneTimeEventId}/checkin`)
    // The check-in board should render — look for the event name in the header
    await expect(page.locator("h1")).toBeVisible()
  })

  test.skip("Recurring event shows the session-specific check-in message", async ({ page }) => {
    const recurringEventId = "REPLACE_WITH_RECURRING_EVENT_ID"
    await page.goto(`/events/${recurringEventId}/checkin`)
    await expect(page.getByText(/use the session check-in link/i)).toBeVisible()
  })

  test.skip("MultiDay event shows the day-specific check-in message", async ({ page }) => {
    const multiDayEventId = "REPLACE_WITH_MULTIDAY_EVENT_ID"
    await page.goto(`/events/${multiDayEventId}/checkin`)
    await expect(page.getByText(/use the day check-in link/i)).toBeVisible()
  })
})
