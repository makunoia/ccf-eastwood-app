import { test as base, expect } from "@playwright/test"
import { test, startFormManually } from "./fixtures/registration-event"

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
  test("opens on the mobile-number step", async ({ page, dgroupEvent }) => {
    await page.goto(dgroupEvent.registerPath)

    await expect(page.getByRole("heading", { name: dgroupEvent.name })).toBeVisible()
    await expect(page.getByText("What's your mobile number?")).toBeVisible()
    // The way past the gate is its own card now, not an underlined aside.
    await expect(page.getByText("First time with us?")).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Start a new registration" })
    ).toBeVisible()
    // The gate looks a number up; opting out of the question is the card's job.
    await expect(page.getByLabel("I don't have a mobile number")).toBeHidden()
  })

  test("renders the first step of the form once the gate is skipped", async ({
    page,
    dgroupEvent,
  }) => {
    await startFormManually(page, dgroupEvent.registerPath)

    await expect(page.getByLabel("First Name")).toBeVisible()
    await expect(page.getByLabel("Last Name")).toBeVisible()
    await expect(page.getByRole("button", { name: "Next", exact: true })).toBeVisible()
  })

  test("advances from Personal Information to DGroup Info", async ({ page, dgroupEvent }) => {
    await startFormManually(page, dgroupEvent.registerPath)
    await page.getByLabel("First Name").fill("Juan")
    await page.getByLabel("Last Name").fill("dela Cruz")
    await page.getByRole("button", { name: "Next", exact: true }).click()

    await expect(page.getByText("Step 2 of 2")).toBeVisible()
    await expect(page.getByText("DGroup Info")).toBeVisible()
  })
})

/**
 * CCF-147 — the shortened flow for someone we already hold a profile for.
 *
 * The masking assertions here are the visible half of a boundary the integration
 * tests pin on the wire: what a stranger who types a live number can actually
 * read off the screen.
 */
test.describe("Registration — pulling up an existing profile", () => {
  test("a returning member registers without retyping their details", async ({
    page,
    dgroupEvent,
    returningMember,
  }) => {
    await page.goto(dgroupEvent.registerPath)
    await page.getByRole("textbox", { name: "Mobile Number" }).fill(returningMember.local)
    await page.getByRole("button", { name: "Continue" }).click()

    // Masked: initials and the last four digits, nothing else.
    await expect(page.getByText("Is this you?")).toBeVisible()
    await expect(page.getByText("M••• S•••")).toBeVisible()
    await expect(page.getByText("Maria Santos")).toBeHidden()

    // Second factor before anything is revealed.
    await page.getByRole("combobox").first().click()
    await page.getByRole("option", { name: returningMember.birthMonth, exact: true }).click()
    await page.getByLabel("Your birth month and year").fill(returningMember.birthYear)
    await page.getByRole("button", { name: "Yes, that's me" }).click()

    // The review screen: their details, and no name inputs to retype.
    await expect(page.getByText("Maria Santos")).toBeVisible()
    await expect(page.getByRole("button", { name: "Edit details" })).toBeVisible()
    await expect(page.getByLabel("First Name")).toBeHidden()
  })

  test("a wrong birthday reveals nothing", async ({ page, dgroupEvent, returningMember }) => {
    await page.goto(dgroupEvent.registerPath)
    await page.getByRole("textbox", { name: "Mobile Number" }).fill(returningMember.local)
    await page.getByRole("button", { name: "Continue" }).click()

    await page.getByRole("combobox").first().click()
    await page.getByRole("option", { name: "September", exact: true }).click()
    await page.getByLabel("Your birth month and year").fill("1992")
    await page.getByRole("button", { name: "Yes, that's me" }).click()

    // By text, not by role: Next's route announcer is also role="alert".
    await expect(page.getByText("don't match this profile")).toBeVisible()
    await expect(page.getByText("Maria Santos")).toBeHidden()
  })

  test("Edit details opens the prefilled fields", async ({
    page,
    dgroupEvent,
    returningMember,
  }) => {
    await page.goto(dgroupEvent.registerPath)
    await page.getByRole("textbox", { name: "Mobile Number" }).fill(returningMember.local)
    await page.getByRole("button", { name: "Continue" }).click()
    await page.getByRole("combobox").first().click()
    await page.getByRole("option", { name: returningMember.birthMonth, exact: true }).click()
    await page.getByLabel("Your birth month and year").fill(returningMember.birthYear)
    await page.getByRole("button", { name: "Yes, that's me" }).click()

    await page.getByRole("button", { name: "Edit details" }).click()
    await expect(page.getByLabel("First Name")).toHaveValue("Maria")
    await expect(page.getByLabel("Last Name")).toHaveValue("Santos")
  })

  test("an unknown number falls through to the form with the number kept", async ({
    page,
    dgroupEvent,
  }) => {
    await page.goto(dgroupEvent.registerPath)
    await page.getByRole("textbox", { name: "Mobile Number" }).fill("9990001111")
    await page.getByRole("button", { name: "Continue" }).click()

    await expect(page.getByLabel("First Name")).toBeVisible()
    // Typed once, not twice.
    await expect(page.getByRole("textbox", { name: "Mobile Number" })).toHaveValue(/999 000 1111/)
  })

  test("saying 'No, not me' yields a blank form", async ({
    page,
    dgroupEvent,
    returningMember,
  }) => {
    await page.goto(dgroupEvent.registerPath)
    await page.getByRole("textbox", { name: "Mobile Number" }).fill(returningMember.local)
    await page.getByRole("button", { name: "Continue" }).click()
    await page.getByRole("button", { name: "No, not me" }).click()

    await expect(page.getByLabel("First Name")).toBeVisible()
    await expect(page.getByLabel("First Name")).toHaveValue("")
  })
})

/**
 * The returning registrant, end to end in a browser.
 *
 * What this pins is *where* the news arrives. The behaviour it replaces told
 * people they were already registered from a `toast.error` fired after the final
 * Register button — so the assertions below are as much about what is absent from
 * step 0 (no name fields, no Register button) as about the message itself.
 */
test.describe("Registration — someone who is already registered", () => {
  /**
   * The step-0 lookup is rate-limited for real — 12 calls per IP per minute,
   * shared between the lookup and the reveal — and a browser run goes through the
   * live limiter rather than a mock. The specs above already spend most of that
   * budget on the default bucket, so this block claims its own; without it the
   * last test here trips the limit and fails looking for a confirm card that was
   * never rendered.
   */
  test.use({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.10" } })

  /** Step 0 through the second factor, which is where standing is resolved. */
  async function identify(
    page: import("@playwright/test").Page,
    registerPath: string,
    member: { local: string; birthMonth: string; birthYear: string }
  ) {
    await page.goto(registerPath)
    await page.getByRole("textbox", { name: "Mobile Number" }).fill(member.local)
    await page.getByRole("button", { name: "Continue" }).click()
    await page.getByRole("combobox").first().click()
    await page.getByRole("option", { name: member.birthMonth, exact: true }).click()
    await page.getByLabel("Your birth month and year").fill(member.birthYear)
    await page.getByRole("button", { name: "Yes, that's me" }).click()
  }

  test("is told at step 0, before filling in anything", async ({
    page,
    dgroupEvent,
    alreadyRegistered,
  }) => {
    await identify(page, dgroupEvent.registerPath, alreadyRegistered)

    await expect(page.getByText("You're already registered")).toBeVisible()
    // The point of the change: no form was walked to find this out. Exact, or
    // "Register another person" on this very screen matches the substring.
    await expect(page.getByLabel("First Name")).toBeHidden()
    await expect(page.getByRole("button", { name: "Register", exact: true })).toBeHidden()
    await expect(page.getByRole("button", { name: "Edit details" })).toBeHidden()
  })

  test("can still choose to update their details", async ({
    page,
    dgroupEvent,
    alreadyRegistered,
  }) => {
    await identify(page, dgroupEvent.registerPath, alreadyRegistered)

    await page.getByRole("button", { name: "Update my details" }).click()
    await expect(page.getByText("Personal Information")).toBeVisible()
  })

  test("is asked only for the field the event started requiring", async ({
    page,
    dgroupEvent,
    nowRequiresLifeStage,
  }) => {
    await identify(page, dgroupEvent.registerPath, nowRequiresLifeStage)

    await expect(page.getByText("We just need one more thing")).toBeVisible()
    await page.getByRole("button", { name: "Continue" }).click()

    // One step, not the whole form again — the DGroup step this event carries is
    // not reopened for a Personal Information field.
    await expect(page.getByText("Personal Information")).toBeVisible()
    await expect(page.getByText(/^Step \d+ of \d+$/)).toBeHidden()
    await expect(page.getByRole("button", { name: "Register" })).toBeVisible()
  })
})
