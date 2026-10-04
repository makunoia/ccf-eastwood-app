import { randomUUID } from "node:crypto"
import { Client } from "pg"
import { test as adminTest, expect } from "./fixtures/admin-session"

type SessionRegistrationFixture = { eventId: string; occurrenceId: string; memberId: string; phone: string; client: Client }
const test = adminTest.extend<{ sessionRegistration: SessionRegistrationFixture }>({
  sessionRegistration: async ({}, provide) => {
    const client = new Client({ connectionString: process.env.DATABASE_URL })
    await client.connect()
    const eventId = randomUUID(), occurrenceId = randomUUID(), memberId = randomUUID()
    const suffix = String(Math.floor(1000000 + Math.random() * 8999999))
    const phone = `+63 919 ${suffix.slice(0, 3)} ${suffix.slice(3)}`
    try {
      await client.query(`INSERT INTO "Event" (id, name, type, "startDate", "endDate", "registrationRsvpEnabled", "walkInSessionMode", "updatedAt") VALUES ($1, 'Session Sunday', 'Recurring', '2026-10-04', '2026-10-11', true, 'Latest', NOW())`, [eventId])
      await client.query(`INSERT INTO "EventOccurrence" (id, "eventId", date, "isOpen", "updatedAt") VALUES ($1, $2, '2026-10-04', false, NOW())`, [occurrenceId, eventId])
      await client.query(`INSERT INTO "Member" (id, "firstName", "lastName", phone, "dateJoined", language, "updatedAt") VALUES ($1, 'Maria', 'Session', $2, NOW(), '{}', NOW())`, [memberId, phone])
      await client.query(`INSERT INTO "EventFormConfig" (id, "eventId", context, "fieldEmail", "updatedAt") VALUES ($1, $2, 'Register', false, NOW())`, [randomUUID(), eventId])
      await provide({ eventId, occurrenceId, memberId, phone, client })
    } finally {
      await client.query(`DELETE FROM "Volunteer" WHERE "eventId" = $1`, [eventId])
      await client.query(`DELETE FROM "CommitteeRole" WHERE "committeeId" IN (SELECT id FROM "VolunteerCommittee" WHERE "eventId" = $1)`, [eventId])
      await client.query(`DELETE FROM "VolunteerCommittee" WHERE "eventId" = $1`, [eventId])
      await client.query(`DELETE FROM "Event" WHERE id = $1`, [eventId])
      await client.query(`DELETE FROM "Member" WHERE id = $1`, [memberId])
      await client.end()
    }
  },
})

const browserErrors = new WeakMap<import("@playwright/test").Page, string[]>()
test.beforeEach(async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `sessionRegistration-test-${randomUUID()}` })
  const errors: string[] = []
  browserErrors.set(page, errors)
  page.on("pageerror", (error) => errors.push(error.message))
})
test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page) ?? []).toEqual([])
  await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0)
})

async function identify(page: import("@playwright/test").Page, fixture: SessionRegistrationFixture) {
  await page.goto(`/events/${fixture.eventId}/register`)
  const sessionCard = page.getByRole("status", { name: "Session registration", exact: true })
  await expect(sessionCard).toHaveCount(1)
  await expect(sessionCard.getByRole("heading", { name: "Session Sunday", exact: true })).toBeVisible()
  await expect(sessionCard.getByText("Sun, Oct 4, 2026", { exact: true })).toBeVisible()
  await page.screenshot({ path: test.info().outputPath(`churchie-sessionRegistration-session-${page.viewportSize()?.width}.png`), fullPage: true })
  await page.getByRole("textbox", { name: "Mobile Number", exact: true }).fill(fixture.phone.replace(/\D/g, "").replace(/^63/, ""))
  await page.getByRole("button", { name: "Continue", exact: true }).click()
  await page.getByRole("button", { name: "Yes, that's me", exact: true }).click()
}

async function submit(page: import("@playwright/test").Page) {
  await page.getByRole("checkbox", { name: /Privacy Policy/i }).check()
  await page.getByRole("button", { name: "Register", exact: true }).click()
}

test("a named session is highlighted above its date", async ({ page, sessionRegistration }) => {
  const seriesId = randomUUID()
  await sessionRegistration.client.query(`INSERT INTO "EventOccurrenceSeries" (id, "eventId", title, "startDate", "endDate", "updatedAt") VALUES ($1, $2, 'Growing Together', '2026-10-04', '2026-10-04', NOW())`, [seriesId, sessionRegistration.eventId])
  await sessionRegistration.client.query(`UPDATE "EventOccurrence" SET "seriesId" = $1 WHERE id = $2`, [seriesId, sessionRegistration.occurrenceId])
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/events/${sessionRegistration.eventId}/register`)
  const card = page.getByRole("status", { name: "Session registration", exact: true })
  await expect(card.getByRole("heading", { name: "Growing Together", exact: true })).toBeVisible()
  await expect(card.getByText("Sun, Oct 4, 2026", { exact: true })).toBeVisible()
  await expect(card.getByRole("heading", { name: "Session Sunday", exact: true })).toHaveCount(0)
  await page.screenshot({ path: test.info().outputPath("churchie-named-session-mobile.png"), fullPage: true })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.screenshot({ path: test.info().outputPath("churchie-named-session-desktop.png"), fullPage: true })
})

test("a volunteer explicitly registers as a participant and can confirm the same session again", async ({ page, sessionRegistration }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const committeeId = randomUUID(), roleId = randomUUID(), volunteerId = randomUUID()
  await sessionRegistration.client.query(`INSERT INTO "VolunteerCommittee" (id, name, "eventId", "updatedAt") VALUES ($1, 'Team', $2, NOW())`, [committeeId, sessionRegistration.eventId])
  await sessionRegistration.client.query(`INSERT INTO "CommitteeRole" (id, name, "committeeId", "updatedAt") VALUES ($1, 'Helper', $2, NOW())`, [roleId, committeeId])
  await sessionRegistration.client.query(`INSERT INTO "Volunteer" (id, "memberId", "eventId", "committeeId", "preferredRoleId", status, "updatedAt") VALUES ($1, $2, $3, $4, $5, 'Confirmed', NOW())`, [volunteerId, sessionRegistration.memberId, sessionRegistration.eventId, committeeId, roleId])
  await identify(page, sessionRegistration)
  await page.getByRole("button", { name: "Register as a participant for this session" }).click()
  await submit(page)
  await expect(page.getByText(/You’re registered for Session Sunday/)).toBeVisible()
  const state = await sessionRegistration.client.query(`SELECT (SELECT COUNT(*) FROM "SessionRsvp" WHERE "occurrenceId" = $1)::int AS expected, (SELECT COUNT(*) FROM "OccurrenceAttendee" WHERE "occurrenceId" = $1)::int AS present`, [sessionRegistration.occurrenceId])
  expect(state.rows[0]).toEqual({ expected: 1, present: 0 })
  await identify(page, sessionRegistration)
  await page.getByRole("button", { name: "Register as a participant for this session" }).click()
  await submit(page)
  await expect(page.getByText(/You’re already registered for Session Sunday/)).toBeVisible()
  await page.screenshot({ path: test.info().outputPath("churchie-sessionRegistration-registration.png"), fullPage: true })
})

test("a changed active session is reviewed before registration is saved", async ({ page, sessionRegistration }) => {
  await identify(page, sessionRegistration)
  const newer = randomUUID()
  await sessionRegistration.client.query(`INSERT INTO "EventOccurrence" (id, "eventId", date, "updatedAt") VALUES ($1, $2, '2026-10-11', NOW())`, [newer, sessionRegistration.eventId])
  await submit(page)
  await expect(page.getByText(/The session has changed/)).toBeVisible()
  await expect(page.getByRole("status", { name: "Session registration", exact: true }).getByText("Sun, Oct 11, 2026", { exact: true })).toBeVisible()
  expect((await sessionRegistration.client.query(`SELECT COUNT(*)::int AS n FROM "SessionRsvp" WHERE "occurrenceId" IN ($1, $2)`, [sessionRegistration.occurrenceId, newer])).rows[0].n).toBe(0)
  await page.getByRole("button", { name: "Register", exact: true }).click()
  await expect(page.getByText(/You’re registered for Session Sunday · Sun, Oct 11/)).toBeVisible()
  expect((await sessionRegistration.client.query(`SELECT "occurrenceId" FROM "SessionRsvp" WHERE "occurrenceId" IN ($1, $2)`, [sessionRegistration.occurrenceId, newer])).rows).toEqual([{ occurrenceId: newer }])
})

test("general check-in uses the latest open session while explicit links retain their session", async ({ page, sessionRegistration }) => {
  await page.goto(`/events/${sessionRegistration.eventId}/checkin`)
  await expect(page.getByText("Check-in is currently unavailable")).toBeVisible()
  await sessionRegistration.client.query(`UPDATE "EventOccurrence" SET "isOpen" = true WHERE id = $1`, [sessionRegistration.occurrenceId])
  const newer = randomUUID()
  await sessionRegistration.client.query(`INSERT INTO "EventOccurrence" (id, "eventId", date, "isOpen", "updatedAt") VALUES ($1, $2, '2026-10-11', true, NOW())`, [newer, sessionRegistration.eventId])
  await page.goto(`/events/${sessionRegistration.eventId}/checkin`)
  await expect(page.getByText(/Sunday, October 11, 2026/)).toBeVisible()
  await expect(page.getByRole("heading", { name: "Session Sunday Check-in" })).toBeVisible()
  await page.goto(`/events/${sessionRegistration.eventId}/checkin/${sessionRegistration.occurrenceId}`)
  await expect(page.getByText(/Sunday, October 4, 2026/)).toBeVisible()
})

test("admin session and breakout rosters show expected participants", async ({ adminPage: page, sessionRegistration }) => {
  await page.goto(`/event/${sessionRegistration.eventId}/forms/EventRegistration`)
  await expect(page.getByText("Session registration", { exact: true })).toBeVisible()
  await expect(page.getByRole("switch", { name: "Enable session registration", exact: true })).toBeChecked()
  await expect(page.getByText("Sun, Oct 4, 2026", { exact: true })).toBeVisible()
  await page.screenshot({ path: test.info().outputPath("churchie-session-registration-setting.png"), fullPage: true })
  const registrantId = randomUUID(), groupId = randomUUID()
  await sessionRegistration.client.query(`INSERT INTO "EventModule" (id, "eventId", type, "updatedAt") VALUES ($1, $2, 'Breakout', NOW())`, [randomUUID(), sessionRegistration.eventId])
  await sessionRegistration.client.query(`INSERT INTO "EventRegistrant" (id, "eventId", "memberId", "updatedAt") VALUES ($1, $2, $3, NOW())`, [registrantId, sessionRegistration.eventId, sessionRegistration.memberId])
  await sessionRegistration.client.query(`INSERT INTO "SessionRsvp" (id, "occurrenceId", "registrantId", "updatedAt") VALUES ($1, $2, $3, NOW())`, [randomUUID(), sessionRegistration.occurrenceId, registrantId])
  const walkInId = randomUUID()
  await sessionRegistration.client.query(`INSERT INTO "EventRegistrant" (id, "eventId", "firstName", "lastName", "updatedAt") VALUES ($1, $2, 'Walk-in', 'Participant', NOW())`, [walkInId, sessionRegistration.eventId])
  await sessionRegistration.client.query(`INSERT INTO "OccurrenceAttendee" (id, "occurrenceId", "registrantId", "checkedInAt") VALUES ($1, $2, $3, NOW())`, [randomUUID(), sessionRegistration.occurrenceId, walkInId])
  await sessionRegistration.client.query(`INSERT INTO "BreakoutGroup" (id, "eventId", name, language, "updatedAt") VALUES ($1, $2, 'Expected Table', '{}', NOW())`, [groupId, sessionRegistration.eventId])
  await sessionRegistration.client.query(`INSERT INTO "BreakoutGroupMember" ("breakoutGroupId", "registrantId") VALUES ($1, $2)`, [groupId, registrantId])
  await page.goto(`/event/${sessionRegistration.eventId}/sessions/${sessionRegistration.occurrenceId}`)
  await expect(page.getByText("1 of 2 checked in · 1 not checked in", { exact: true })).toBeVisible()
  const turnoutBar = page.getByRole("progressbar", { name: "Turnout", exact: true })
  await expect(turnoutBar).toHaveAttribute("aria-valuenow", "50")
  await expect(turnoutBar).toHaveAttribute("aria-valuetext", "1 of 2 checked in")
  await expect(page.getByText("Series turnout", { exact: true })).toHaveCount(0)
  await page.getByRole("tab", { name: "Registered for this session (1)", exact: true }).click()
  await expect(page.getByRole("link", { name: "Maria Session", exact: true })).toBeVisible()
  await expect(page.getByRole("cell", { name: "Not checked in", exact: true })).toBeVisible()
  await page.screenshot({ path: test.info().outputPath("churchie-sessionRegistration-roster.png"), fullPage: true })
  await page.goto(`/event/${sessionRegistration.eventId}/breakouts/${groupId}`)
  await expect(page.getByRole("cell", { name: "Expected", exact: true })).toBeVisible()
})
