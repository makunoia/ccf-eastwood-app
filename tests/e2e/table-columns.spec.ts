import { test, expect } from "./fixtures/admin-session"

/**
 * The column picker, end to end and across a reload.
 *
 * The whole reason column choices live in the database rather than in component
 * state is that they must survive leaving the page. That is exactly the claim a
 * unit test cannot make, so it is the one this spec exists to check.
 */

test.describe("Table column picker", () => {
  test("hiding a column survives a reload", async ({ adminPage: page }) => {
    await page.goto("/members")

    const table = page.locator("table").first()
    await expect(table.getByRole("columnheader", { name: "Email" })).toBeVisible()

    await page.getByRole("button", { name: "Columns", exact: true }).click()
    const drawer = page.getByRole("dialog")
    await expect(drawer).toBeVisible()

    await drawer.getByRole("checkbox", { name: "Email" }).click()
    await expect(table.getByRole("columnheader", { name: "Email" })).toHaveCount(0)

    await page.keyboard.press("Escape")
    await expect(drawer).toBeHidden()

    await page.reload()
    // The saved layout is read in the dashboard layout, so it is applied on the
    // server — the column should never appear, not appear and then vanish.
    await expect(page.locator("table").first()).toBeVisible()
    await expect(page.locator("table").first().getByRole("columnheader", { name: "Email" })).toHaveCount(0)
    await expect(page.locator("table").first().getByRole("columnheader", { name: "Name" })).toBeVisible()
  })

  test("an opt-in column can be added and stays added", async ({ adminPage: page }) => {
    await page.goto("/members")

    await page.getByRole("button", { name: "Columns", exact: true }).click()
    const drawer = page.getByRole("dialog")
    await drawer.getByRole("checkbox", { name: "Show Work City" }).click()
    await page.keyboard.press("Escape")

    await expect(
      page.locator("table").first().getByRole("columnheader", { name: "Work City" }),
    ).toBeVisible()

    await page.reload()
    await expect(
      page.locator("table").first().getByRole("columnheader", { name: "Work City" }),
    ).toBeVisible()
  })

  test("the identifier column is never offered for hiding", async ({ adminPage: page }) => {
    await page.goto("/members")
    await page.getByRole("button", { name: "Columns", exact: true }).click()

    const drawer = page.getByRole("dialog")
    // Name is listed, but as a locked row rather than a toggle.
    await expect(drawer.getByRole("checkbox", { name: "Name" })).toHaveCount(0)
    await expect(drawer.getByText("Always shown")).toHaveCount(1)
    await expect(drawer.getByText("Name", { exact: true })).toBeVisible()

    // The selection checkbox and the row-actions menu are locked too, but they
    // are plumbing rather than choices, so they aren't listed at all.
    await expect(drawer.getByText("select", { exact: true })).toHaveCount(0)
    await expect(drawer.getByText("actions", { exact: true })).toHaveCount(0)
  })

  test("a mobile number copies in full", async ({ adminPage: page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"])
    await page.goto("/members")

    await page.getByRole("button", { name: /copy mobile/i }).first().click()

    const copied = await page.evaluate(() => navigator.clipboard.readText())
    expect(copied).toMatch(/^\+63 /)
  })
})

/**
 * The table's chrome, measured in a real browser — which is the only place the
 * two defects it fixes were visible.
 */
test.describe("Table chrome", () => {
  test("the toolbar states how many rows are on screen", async ({ adminPage: page }) => {
    await page.goto("/members")

    const table = page.locator("table").first()
    await expect(table).toBeVisible()
    const rows = await table.locator("tbody tr").count()

    // The strip used to be empty on its left, which is what this line fills.
    await expect(page.getByText(new RegExp(`^${rows} members?$`))).toBeVisible()
  })

  test("the row-actions trigger clears the table's right edge and stays clickable", async ({
    adminPage: page,
  }) => {
    await page.goto("/members")

    const table = page.locator("table").first()
    await expect(table).toBeVisible()

    const trigger = page.getByRole("button", { name: "Open menu" }).first()
    const button = await trigger.boundingBox()
    const bounds = await table.boundingBox()
    if (!button || !bounds) throw new Error("could not measure the actions cell")

    // On the old 44px `micro` column the 32px trigger overflowed its own cell
    // and was clipped flush against the border. It now sits on a real gutter.
    const gutter = bounds.x + bounds.width - (button.x + button.width)
    expect(gutter).toBeGreaterThanOrEqual(6)
    expect(button.width).toBeGreaterThanOrEqual(30)

    // And the whole trigger is reachable — including its right edge, which the
    // clipped version had lost.
    await page.mouse.click(button.x + button.width - 2, button.y + button.height / 2)
    await expect(page.getByRole("menu")).toBeVisible()
  })
})
