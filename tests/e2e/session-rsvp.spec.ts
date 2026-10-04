import { randomUUID } from "node:crypto"
import { Client } from "pg"
import { test as adminTest, expect } from "./fixtures/admin-session"

type RsvpFixture = { eventId: string; occurrenceId: string; memberId: string; phone: string; client: Client }
const test = adminTest.extend<{ rsvp: RsvpFixture }>({
  rsvp: async ({}, provide) => {
    const client = new Client({ connectionString: process.env.DATABASE_URL })
    await client.connect()
    const eventId = randomUUID(), occurrenceId = randomUUID(), memberId = randomUUID()
    const suffix = String(Math.floor(1000000 + Math.random() * 8999999))
    const phone = `+63 919 ${suffix.slice(0, 3)} ${suffix.slice(3)}`
    try {
      await client.query(`INSERT INTO "Event" (id, name, type, "startDate", "endDate", "registrationRsvpEnabled", "walkInSessionMode", "updatedAt") VALUES ($1, 'RSVP Sunday', 'Recurring', '2026-10-04', '2026-10-11', true, 'Latest', NOW())`, [eventId])
      await client.query(`INSERT INTO "EventOccurrence" (id, "eventId", date, "isOpen", "updatedAt") VALUES ($1, $2, '2026-10-04', false, NOW())`, [occurrenceId, eventId])
      await client.query(`INSERT INTO "Member" (id, "firstName", "lastName", phone, "dateJoined", language, "updatedAt") VALUES ($1, 'Maria', 'Rsvp', $2, NOW(), '{}', NOW())`, [memberId, phone])
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
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `rsvp-test-${randomUUID()}` })
  const errors: string[] = []
  browserErrors.set(page, errors)
  page.on("pageerror", (error) => errors.push(error.message))
})
test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page) ?? []).toEqual([])
  await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0)
})

async function identify(page: import("@playwright/test").Page, fixture: RsvpFixture) {
  await page.goto(`/events/${fixture.eventId}/register`)
  await page.getByRole("textbox", { name: "Mobile Number", exact: true }).fill(fixture.phone.replace(/\D/g, "").replace(/^63/, ""))
  await page.getByRole("button", { name: "Continue", exact: true }).click()
  await page.getByRole("button", { name: "Yes, that's me", exact: true }).click()
}

async function submit(page: import("@playwright/test").Page) {
  await page.getByRole("checkbox", { name: /Privacy Policy/i }).check()
  await page.getByRole("button", { name: "Register", exact: true }).click()
}

test("a volunteer explicitly RSVPs as a participant and can confirm the same session again", async ({ page, rsvp }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const committeeId = randomUUID(), roleId = randomUUID(), volunteerId = randomUUID()
  await rsvp.client.query(`INSERT INTO "VolunteerCommittee" (id, name, "eventId", "updatedAt") VALUES ($1, 'Team', $2, NOW())`, [committeeId, rsvp.eventId])
  await rsvp.client.query(`INSERT INTO "CommitteeRole" (id, name, "committeeId", "updatedAt") VALUES ($1, 'Helper', $2, NOW())`, [roleId, committeeId])
  await rsvp.client.query(`INSERT INTO "Volunteer" (id, "memberId", "eventId", "committeeId", "preferredRoleId", status, "updatedAt") VALUES ($1, $2, $3, $4, $5, 'Confirmed', NOW())`, [volunteerId, rsvp.memberId, rsvp.eventId, committeeId, roleId])
  await identify(page, rsvp)
  await page.getByRole("button", { name: "Register as a participant for this session" }).click()
  await submit(page)
  await expect(page.getByText(/You’re registered for RSVP Sunday/)).toBeVisible()
  const state = await rsvp.client.query(`SELECT (SELECT COUNT(*) FROM "SessionRsvp" WHERE "occurrenceId" = $1)::int AS expected, (SELECT COUNT(*) FROM "OccurrenceAttendee" WHERE "occurrenceId" = $1)::int AS present`, [rsvp.occurrenceId])
  expect(state.rows[0]).toEqual({ expected: 1, present: 0 })
  await identify(page, rsvp)
  await page.getByRole("button", { name: "Register as a participant for this session" }).click()
  await submit(page)
  await expect(page.getByText(/You’re already registered for RSVP Sunday/)).toBeVisible()
  await page.screenshot({ path: "/private/tmp/churchie-rsvp-registration.png", fullPage: true })
})

test("a changed active session is reviewed before registration is saved", async ({ page, rsvp }) => {
  await identify(page, rsvp)
  const newer = randomUUID()
  await rsvp.client.query(`INSERT INTO "EventOccurrence" (id, "eventId", date, "updatedAt") VALUES ($1, $2, '2026-10-11', NOW())`, [newer, rsvp.eventId])
  await submit(page)
  await expect(page.getByText(/The session has changed/)).toBeVisible()
  await expect(page.getByText(/RSVP Sunday · Sun, Oct 11, 2026/)).toBeVisible()
  expect((await rsvp.client.query(`SELECT COUNT(*)::int AS n FROM "SessionRsvp" WHERE "occurrenceId" IN ($1, $2)`, [rsvp.occurrenceId, newer])).rows[0].n).toBe(0)
  await page.getByRole("button", { name: "Register", exact: true }).click()
  await expect(page.getByText(/You’re registered for RSVP Sunday · Sun, Oct 11/)).toBeVisible()
  expect((await rsvp.client.query(`SELECT "occurrenceId" FROM "SessionRsvp" WHERE "occurrenceId" IN ($1, $2)`, [rsvp.occurrenceId, newer])).rows).toEqual([{ occurrenceId: newer }])
})

test("general check-in uses the latest open session while explicit links retain their session", async ({ page, rsvp }) => {
  await page.goto(`/events/${rsvp.eventId}/checkin`)
  await expect(page.getByText("Check-in is currently unavailable")).toBeVisible()
  await rsvp.client.query(`UPDATE "EventOccurrence" SET "isOpen" = true WHERE id = $1`, [rsvp.occurrenceId])
  const newer = randomUUID()
  await rsvp.client.query(`INSERT INTO "EventOccurrence" (id, "eventId", date, "isOpen", "updatedAt") VALUES ($1, $2, '2026-10-11', true, NOW())`, [newer, rsvp.eventId])
  await page.goto(`/events/${rsvp.eventId}/checkin`)
  await expect(page.getByText(/Sunday, October 11, 2026/)).toBeVisible()
  await expect(page.getByRole("heading", { name: "RSVP Sunday Check-in" })).toBeVisible()
  await page.goto(`/events/${rsvp.eventId}/checkin/${rsvp.occurrenceId}`)
  await expect(page.getByText(/Sunday, October 4, 2026/)).toBeVisible()
})

test("admin session and breakout rosters show expected participants", async ({ adminPage: page, rsvp }) => {
  const registrantId = randomUUID(), groupId = randomUUID()
  await rsvp.client.query(`INSERT INTO "EventModule" (id, "eventId", type, "updatedAt") VALUES ($1, $2, 'Breakout', NOW())`, [randomUUID(), rsvp.eventId])
  await rsvp.client.query(`INSERT INTO "EventRegistrant" (id, "eventId", "memberId", "updatedAt") VALUES ($1, $2, $3, NOW())`, [registrantId, rsvp.eventId, rsvp.memberId])
  await rsvp.client.query(`INSERT INTO "SessionRsvp" (id, "occurrenceId", "registrantId", "updatedAt") VALUES ($1, $2, $3, NOW())`, [randomUUID(), rsvp.occurrenceId, registrantId])
  await rsvp.client.query(`INSERT INTO "BreakoutGroup" (id, "eventId", name, language, "updatedAt") VALUES ($1, $2, 'Expected Table', '{}', NOW())`, [groupId, rsvp.eventId])
  await rsvp.client.query(`INSERT INTO "BreakoutGroupMember" ("breakoutGroupId", "registrantId") VALUES ($1, $2)`, [groupId, registrantId])
  await page.goto(`/event/${rsvp.eventId}/sessions/${rsvp.occurrenceId}`)
  await page.getByRole("tab", { name: "RSVP (1)", exact: true }).click()
  await expect(page.getByRole("link", { name: "Maria Rsvp", exact: true })).toBeVisible()
  await expect(page.getByText("Not checked in", { exact: true })).toBeVisible()
  await page.screenshot({ path: "/private/tmp/churchie-rsvp-roster.png", fullPage: true })
  await page.goto(`/event/${rsvp.eventId}/breakouts/${groupId}`)
  await expect(page.getByRole("cell", { name: "RSVP", exact: true })).toBeVisible()
})
