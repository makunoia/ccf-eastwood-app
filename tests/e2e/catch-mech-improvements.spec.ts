import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { test as adminTest, expect } from "./fixtures/admin-session"

const test = adminTest.extend<{ catchMech: { eventId: string; requestId: string; faciToken: string; volunteerToken: string } }>({
  catchMech: async ({}, provide) => {
    const id = `catch-mech-e2e-${randomUUID()}`
    const run = (command: string) => execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "tests/e2e/fixtures/catch-mech-data.ts", command, id], { encoding: "utf8", env: process.env })
    try { await provide(JSON.parse(run("seed"))) }
    finally { run("cleanup") }
  },
})

test("moves interest out of home and manually assigns a full unmatched DGroup", async ({ adminPage: page, catchMech }) => {
  await page.goto(`/event/${catchMech.eventId}/catch-mech`)
  await expect(page.getByRole("button", { name: "Find DGroup" })).toHaveCount(0)
  await page.getByRole("link", { name: /DGroup interest.*1 awaiting placement/ }).click()
  await expect(page.getByRole("heading", { name: "DGroup interest" })).toBeVisible()
  await page.screenshot({ path: test.info().outputPath("interest-list.png"), fullPage: true })
  await page.getByRole("link", { name: "Alpha Returnee" }).click()
  await expect(page.getByRole("heading", { name: "Alpha Returnee" })).toBeVisible()
  await page.getByRole("tab", { name: "Manual assignment" }).click()
  await page.getByRole("textbox", { name: "Search active DGroups" }).fill("Manual Leader")
  await expect(page.getByRole("heading", { name: "Manual Capacity Group" })).toBeVisible()
  await page.screenshot({ path: test.info().outputPath("manual-assignment.png"), fullPage: true })
  await page.getByRole("button", { name: "Assign over capacity", exact: true }).click()
  const confirmation = page.getByRole("alertdialog")
  await expect(confirmation).toContainText("limit of 0")
  await confirmation.getByRole("button", { name: "Assign over capacity" }).click()
  await expect(page).toHaveURL(new RegExp(`/event/${catchMech.eventId}/catch-mech/interest$`))
  await expect(page.getByText("Awaiting leader confirmation", { exact: true })).toBeVisible()
})

test("sorts attendance and exposes the same interest flow on mobile using the keyboard", async ({ adminPage: page, catchMech }) => {
  await page.goto(`/event/${catchMech.eventId}/catch-mech/pending`)
  await expect(page.getByText("2 sessions · 1 return", { exact: true })).toBeVisible()
  await expect(page.getByText("3 sessions · 2 returns", { exact: true })).toBeVisible()
  await expect(page.getByText("67%", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Sort by Attendance ascending", exact: true }).click()
  await expect(page.locator("tbody tr").first()).toContainText("Alpha Returnee")
  await page.getByRole("button", { name: "Sort by Attendance descending", exact: true }).click()
  await expect(page.locator("tbody tr").first()).toContainText("Beta Returnee")
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/event/${catchMech.eventId}/catch-mech/interest/${catchMech.requestId}`)
  const suggested = page.getByRole("tab", { name: "Suggested matches" })
  await suggested.focus()
  await page.keyboard.press("ArrowRight")
  await expect(page.getByRole("tab", { name: "Manual assignment" })).toHaveAttribute("data-state", "active")
  await page.getByRole("textbox", { name: "Search active DGroups" }).fill("Manual")
  await expect(page.getByRole("button", { name: "Assign over capacity" })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: test.info().outputPath("manual-assignment-mobile.png"), fullPage: true })
})


test("empty public rosters can record a no-placement response", async ({ page, catchMech }) => {
  execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "tests/e2e/fixtures/catch-mech-data.ts", "clear-attendance", catchMech.eventId], { env: process.env })
  await page.goto(`/events/${catchMech.eventId}/catch-mech/${catchMech.faciToken}`)
  await expect(page.getByText("Alpha Returnee", { exact: true })).toHaveCount(0)
  await page.getByRole("button", { name: "Submit no placements" }).click()
  await expect(page.getByText("Your confirmations have been submitted.")).toBeVisible()
  await page.goto(`/events/${catchMech.eventId}/catch-mech/volunteers/${catchMech.volunteerToken}`)
  await expect(page.getByText("Alpha Returnee", { exact: true })).toHaveCount(0)
  await page.getByRole("button", { name: "Submit no placements" }).click()
  await expect(page.getByText("Your response has been recorded.")).toBeVisible()
})
