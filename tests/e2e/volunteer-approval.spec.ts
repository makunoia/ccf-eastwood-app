import { test, expect } from "@playwright/test"

/**
 * E2E tests for /volunteer-approval/[token]
 *
 * Tests that don't require seeded data:
 *   - Invalid/non-existent token shows "Link not found" message
 *
 * Tests requiring a real volunteer token are skipped and annotated.
 */

test.describe("Volunteer Leader Approval page", () => {
  test("shows 'Link not found' for an invalid token", async ({ page }) => {
    await page.goto("/volunteer-approval/invalid-token-that-does-not-exist")
    await expect(page.getByText("Link not found")).toBeVisible()
    await expect(page.getByText(/invalid or has expired/i)).toBeVisible()
  })

  test("shows 'Link not found' for a UUID-shaped but non-existent token", async ({ page }) => {
    const fakeToken = "00000000-0000-0000-0000-000000000000"
    await page.goto(`/volunteer-approval/${fakeToken}`)
    await expect(page.getByText("Link not found")).toBeVisible()
  })

  test("renders the Leader Approval heading", async ({ page }) => {
    // This test only checks that the page shell renders — no token needed
    await page.goto("/volunteer-approval/any-token-here")
    await expect(page.getByRole("heading", { name: "Leader Approval" })).toBeVisible()
  })

  test.skip("shows volunteer details and approve/reject buttons for a valid Pending token", async ({ page }) => {
    const pendingToken = "REPLACE_WITH_REAL_PENDING_VOLUNTEER_TOKEN"
    await page.goto(`/volunteer-approval/${pendingToken}`)
    await expect(page.getByRole("heading", { name: "Leader Approval" })).toBeVisible()
    await expect(page.getByRole("button", { name: /approve/i })).toBeVisible()
    await expect(page.getByRole("button", { name: /reject/i })).toBeVisible()
  })

  test.skip("shows already-resolved state for a previously actioned token", async ({ page }) => {
    const resolvedToken = "REPLACE_WITH_ALREADY_RESOLVED_TOKEN"
    await page.goto(`/volunteer-approval/${resolvedToken}`)
    // Should show resolved status, not approve/reject buttons
    await expect(page.getByRole("button", { name: /approve/i })).not.toBeVisible()
  })
})
