// @vitest-environment jsdom
import * as React from "react"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

import { RegistrationForm } from "@/app/events/[id]/register/registration-form"
import { BARE_EVENT_FORM_CONFIG } from "@/lib/forms/context-config"

/**
 * The DGroup section of the public registration form, and the chrome around it.
 *
 * Two regressions and one layout rule live here, and they share a root cause:
 * the form used to render a *second* layout whenever `sections.length` fell to 1,
 * and every section guard carried a `!isMultiStep ||` arm for it.
 *
 *  1. `skipSmallGroup` dropped the DGroup *step* but not the DGroup *block*, and
 *     dropping the step is exactly what collapses the form to one section — so a
 *     member already in a DGroup was the one person who still got asked to join
 *     one, inline, under a hand-drawn "DGroup" divider.
 *  2. "Help us connect you" promised optional matching details and then rendered
 *     nothing, because all four fields under it are individually toggleable and
 *     that event had them off.
 *
 * The layout specs below pin the fix for both: one chrome, so a section can only
 * ever render as the step it belongs to.
 */

const {
  lookupProfileByMobile,
  revealProfileForRegistration,
  lookupMemberForRegistration,
  createRegistrant,
} = vi.hoisted(() => ({
  lookupProfileByMobile: vi.fn(),
  revealProfileForRegistration: vi.fn(),
  lookupMemberForRegistration: vi.fn(),
  createRegistrant: vi.fn(),
}))

vi.mock("@/app/(dashboard)/events/registration-lookup-actions", () => ({
  lookupProfileByMobile,
  revealProfileForRegistration,
}))
vi.mock("@/app/(dashboard)/events/actions", () => ({
  lookupMemberForRegistration,
  createRegistrant,
  createHouseholdRegistration: vi.fn(),
}))
vi.mock("@/app/(dashboard)/events/cluster-actions", () => ({ registerForCluster: vi.fn() }))
vi.mock("@/app/(dashboard)/guests/actions", () => ({
  searchMembersForLeaderLookup: vi.fn(async () => ({ success: true, data: [] })),
}))

beforeAll(() => {
  // Radix probes for all of these in jsdom.
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.setPointerCapture ??= () => {}
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

/** A member profile the step-0 lookup will hand back. */
function profile(overrides: Record<string, unknown> = {}) {
  return {
    recordId: "m1",
    recordType: "member" as const,
    firstName: "Mark",
    lastName: "Noya",
    nickname: "Mark",
    email: "mark@example.com",
    emailMasked: "m•••@example.com",
    phone: "+63 927 141 8149",
    birthMonth: null,
    birthYear: null,
    ageRangeBucketId: null,
    lifeStageId: null,
    gender: null,
    language: [],
    meetingPreference: null,
    workCity: null,
    scheduleDayOfWeek: null,
    scheduleTimeStart: null,
    scheduleTimeEnd: null,
    smallGroupId: null,
    claimedSmallGroupId: null,
    claimedSatellite: null,
    isVolunteer: false,
    ...overrides,
  }
}

beforeEach(() => {
  lookupProfileByMobile.mockReset()
  revealProfileForRegistration.mockReset()
  lookupMemberForRegistration.mockReset()
  createRegistrant.mockReset()
  // Nobody on file, unless a spec says otherwise.
  lookupMemberForRegistration.mockResolvedValue(null)
  createRegistrant.mockResolvedValue({ success: true, data: { breakoutGroup: null } })
  lookupProfileByMobile.mockResolvedValue({
    outcome: "match",
    recordId: "m1",
    recordType: "member",
    maskedName: "M••• N•••",
    contactHint: "•••• 8149",
    // No stored birthday, so "Yes, that's me" opens the profile in one click.
    needsSecondFactor: false,
  })
  // A reveal that found nothing remarkable: not a volunteer, not already on the
  // list, and nothing the form still has to ask. Specs override per case.
  revealProfileForRegistration.mockResolvedValue({
    ok: true,
    profile: profile(),
    grant: "grant-token",
    alreadyRegistered: false,
    fieldsStillNeeded: [],
  })
})

function renderForm(config: Partial<typeof BARE_EVENT_FORM_CONFIG> = {}) {
  return render(
    <RegistrationForm
      eventId="e1"
      eventName="Sunday Service"
      config={{ ...BARE_EVENT_FORM_CONFIG, sectionSmallGroup: true, ...config }}
    />
  )
}

/** Step 0 → "Is this you?" → the form itself, as a returning person. */
async function identifyAsReturningMember() {
  fireEvent.change(screen.getByLabelText(/Mobile Number/), {
    target: { value: "09271418149" },
  })
  fireEvent.click(screen.getByRole("button", { name: "Continue" }))
  fireEvent.click(await screen.findByRole("button", { name: "Yes, that's me" }))
  await screen.findByRole("button", { name: "Edit details" })
}

/** Skip step 0 entirely — the path a first-timer takes. */
function skipGate() {
  fireEvent.click(screen.getByRole("button", { name: "Start a new registration" }))
}

/** Step 0 → a named first-timer → the DGroup step. */
async function skipGateToDGroupStep() {
  skipGate()
  fireEvent.change(screen.getByLabelText(/First Name/), { target: { value: "Juan" } })
  fireEvent.change(screen.getByLabelText(/Last Name/), { target: { value: "dela Cruz" } })
  fireEvent.click(screen.getByRole("button", { name: "Next" }))
  fireEvent.click(await screen.findByRole("checkbox", { name: "I want to join a DGroup" }))
}

describe("DGroup section — someone already in a DGroup", () => {
  /**
   * The regression. `skipSmallGroup` removes the step, which leaves `personal`
   * as the only section; the old `!isMultiStep ||` arm then rendered the block
   * inline anyway. Nothing about the section may survive that.
   */
  it("is not asked to join one on a form that has no other section", async () => {
    revealProfileForRegistration.mockResolvedValue({
      ok: true,
      profile: profile({ smallGroupId: "sg1" }),
    })
    renderForm()
    await identifyAsReturningMember()

    expect(screen.queryByRole("checkbox", { name: "I want to join a DGroup" })).toBeNull()
    expect(screen.queryByRole("checkbox", { name: "I'm already part of a DGroup" })).toBeNull()
    expect(screen.queryByText("DGroup")).toBeNull()
    expect(screen.queryByText(/don't have a DGroup on file/)).toBeNull()
  })

  /**
   * The same person on a form that *does* have another section. This always
   * worked — `currentSectionKey` could never be "smallgroup" — and it is the
   * control that proves the fix above didn't just hide the section everywhere.
   */
  it("is not asked on a multi-section form either", async () => {
    revealProfileForRegistration.mockResolvedValue({
      ok: true,
      profile: profile({ smallGroupId: "sg1" }),
    })
    renderForm({ sectionDietary: true })
    await identifyAsReturningMember()

    expect(screen.queryByRole("checkbox", { name: "I want to join a DGroup" })).toBeNull()
    // Dietary is the second step, so the DGroup step is genuinely gone rather
    // than merely off-screen.
    expect(screen.getByText("Step 1 of 2")).toBeDefined()
    expect(screen.getByText("Personal Information")).toBeDefined()
  })

  it("still asks a member who has no DGroup yet", async () => {
    renderForm()
    await identifyAsReturningMember()
    fireEvent.click(screen.getByRole("button", { name: "Next" }))

    expect(await screen.findByRole("checkbox", { name: "I want to join a DGroup" })).toBeDefined()
    expect(screen.getByText(/don't have a DGroup on file/)).toBeDefined()
  })

  /**
   * The gap this closes. A member with no DGroup on file used to get a lone
   * "Join a DGroup" toggle — the *only* record type that couldn't say it was
   * already in one, because `Member.smallGroupId` is admin-owned and there was
   * nowhere to put a self-report. Their answer now becomes a Pending request,
   * so the option belongs on the form.
   */
  it("lets a member say they are already in one", async () => {
    renderForm()
    await identifyAsReturningMember()
    fireEvent.click(screen.getByRole("button", { name: "Next" }))

    const already = await screen.findByRole("checkbox", {
      name: "I'm already part of a DGroup",
    })
    fireEvent.click(already)

    // Ticking it opens the same leader search guests get — that is the whole
    // point of the branch, and it was unreachable for members.
    expect(await screen.findByLabelText(/Search by leader's name/)).toBeDefined()
    expect(
      screen.getByRole("checkbox", { name: "My DGroup is at another CCF satellite" })
    ).toBeDefined()
  })

  it("keeps the two answers mutually exclusive for a member", async () => {
    renderForm()
    await identifyAsReturningMember()
    fireEvent.click(screen.getByRole("button", { name: "Next" }))

    const wants = () => screen.getByRole("checkbox", { name: "I want to join a DGroup" })
    fireEvent.click(await screen.findByRole("checkbox", { name: "I want to join a DGroup" }))
    // The matching questions appearing is the render settling — re-query after.
    await screen.findByRole("checkbox", { name: "I'm already part of a DGroup" })
    expect(wants().getAttribute("data-state")).toBe("checked")

    // Members used to have a single toggle with nothing to be exclusive against.
    // Now that there are two, ticking one must clear the other — someone cannot
    // both be seeking a DGroup and already in one.
    fireEvent.click(screen.getByRole("checkbox", { name: "I'm already part of a DGroup" }))
    await screen.findByLabelText(/Search by leader's name/)
    expect(wants().getAttribute("data-state")).toBe("unchecked")
  })
})

describe("DGroup section — \"Help us connect you\"", () => {
  /**
   * The heading is not a section of its own: it introduces four individually
   * toggleable fields. With every one of them off it introduced nothing.
   */
  it("stays hidden when every matching field is toggled off", async () => {
    renderForm()
    await skipGateToDGroupStep()

    expect(screen.queryByText("Help us connect you")).toBeNull()
  })

  it("appears as soon as one of them is on", async () => {
    renderForm({ fieldWorkCity: true })
    await skipGateToDGroupStep()

    expect(screen.getByText("Help us connect you")).toBeDefined()
    expect(screen.getByText(/Work \/ Home City/)).toBeDefined()
  })
})

describe("the mobile-number gate", () => {
  /**
   * The gate asks for a number in order to look one up. An "I don't have one"
   * checkbox inside the input was a second shape for the same exit the card
   * below already offers, and it left the screen with two ways to say the same
   * thing.
   */
  it("offers no opt-out inside the number field", () => {
    renderForm()

    expect(screen.getByLabelText(/Mobile Number/)).toBeDefined()
    expect(screen.queryByLabelText("I don't have a mobile number")).toBeNull()
  })

  /** The way past the gate is a card of its own, not an underlined aside. */
  it("puts starting fresh on its own card", () => {
    renderForm()

    const start = screen.getByRole("button", { name: "Start a new registration" })
    expect(start).toBeDefined()
    expect(screen.getByText("First time with us?")).toBeDefined()
    expect(screen.queryByText(/Skip — fill in the form manually/)).toBeNull()

    fireEvent.click(start)
    expect(screen.getByText("Personal Information")).toBeDefined()
  })

  /** The gate is the door's first screen, so the board has to be reachable. */
  it("keeps a way back to the check-in board at a walk-in door", () => {
    render(
      <RegistrationForm
        eventId="e1"
        eventName="Sunday Service"
        config={{ ...BARE_EVENT_FORM_CONFIG, sectionSmallGroup: true }}
        walkIn={{ occurrenceId: null, prefill: {}, backHref: "/register/c/tok-1/check-in" }}
      />
    )

    expect(
      screen.getByRole("link", { name: "Back to check-in" }).getAttribute("href")
    ).toBe("/register/c/tok-1/check-in")
  })
})

describe("stepping back out of the form", () => {
  /** Step 1 used to be a one-way door — no way to fix a mistyped number. */
  it("returns to the gate from the first step", () => {
    renderForm()
    skipGate()

    fireEvent.click(screen.getByRole("button", { name: "Back" }))

    expect(screen.getByText("What's your mobile number?")).toBeDefined()
  })

  /** Correcting the number is the reason to come back, so it survives. */
  it("keeps the number that was typed at the gate", () => {
    renderForm()
    fireEvent.change(screen.getByLabelText(/Mobile Number/), {
      target: { value: "09271418149" },
    })
    skipGate()
    fireEvent.click(screen.getByRole("button", { name: "Back" }))

    expect((screen.getByLabelText(/Mobile Number/) as HTMLInputElement).value).toBe(
      "927 141 8149"
    )
  })

  /**
   * Everything else must not survive. Backing out of a form carrying someone
   * else's resolved profile and then registering would otherwise file the next
   * person under the last one's details — the same failure the walk-in reset
   * exists to prevent.
   */
  it("drops the profile it was carrying", async () => {
    revealProfileForRegistration.mockResolvedValue({
      ok: true,
      profile: profile({ smallGroupId: "sg1" }),
    })
    renderForm()
    await identifyAsReturningMember()

    fireEvent.click(screen.getByRole("button", { name: "Back" }))
    fireEvent.click(screen.getByRole("button", { name: "Start a new registration" }))

    // A blank form, not the profile's review card.
    expect(screen.queryByRole("button", { name: "Edit details" })).toBeNull()
    expect((screen.getByLabelText(/First Name/) as HTMLInputElement).value).toBe("")
    // And the DGroup step is back, since we no longer know who this is.
    expect(screen.getByText("Step 1 of 2")).toBeDefined()
  })
})

describe("mid-form \"Is this you?\" — confirming an existing record", () => {
  /** Step 1 typed by hand, then matched on email by the lookup `handleNext` runs. */
  async function typeStepOneAndConfirm() {
    skipGate()
    fireEvent.change(screen.getByLabelText(/First Name/), { target: { value: "Mark" } })
    fireEvent.change(screen.getByLabelText(/Last Name/), { target: { value: "Noya" } })
    fireEvent.change(screen.getByLabelText(/Email/), {
      target: { value: "mark@example.com" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    fireEvent.click(await screen.findByRole("button", { name: "Yes, that's me" }))
  }

  /**
   * The regression. Confirming used to check whether any step remained and, if
   * none did, submit on the spot — no form, no Register button, no way back.
   * Dropping the DGroup step is what usually emptied the queue, so the shortcut
   * fired for precisely the people who already had a record.
   */
  it("shows the form rather than registering on the spot", async () => {
    lookupMemberForRegistration.mockResolvedValue({
      id: "m1",
      firstName: "Mark",
      lastName: "Noya",
      email: "mark@example.com",
      phone: "+63 927 141 8149",
      matchedBy: "email",
      recordType: "member",
      // Already in a DGroup, so that step is dropped and nothing else remains.
      smallGroupId: "sg1",
    })
    renderForm()
    await typeStepOneAndConfirm()

    expect(await screen.findByRole("button", { name: "Register" })).toBeDefined()
    expect(createRegistrant).not.toHaveBeenCalled()
    // And they are not asked about a DGroup they are already in.
    expect(screen.queryByRole("checkbox", { name: "Join a DGroup" })).toBeNull()
  })

  it("still advances to the next step when one remains", async () => {
    lookupMemberForRegistration.mockResolvedValue({
      id: "m1",
      firstName: "Mark",
      lastName: "Noya",
      email: "mark@example.com",
      phone: "+63 927 141 8149",
      matchedBy: "email",
      recordType: "member",
      smallGroupId: null,
    })
    renderForm()
    await typeStepOneAndConfirm()

    expect(await screen.findByText("DGroup Info")).toBeDefined()
    expect(screen.getByText("Step 2 of 2")).toBeDefined()
    expect(createRegistrant).not.toHaveBeenCalled()
  })
})

describe("registration form chrome", () => {
  /**
   * The form used to swap to a wholly different card — "Register / Fill in your
   * details to register for this event." plus per-section divider headings —
   * whenever it came down to one section. Returning members are precisely the
   * people whose forms collapse, so they were the ones served a layout nobody
   * else saw.
   */
  it("keeps the stepped layout when a returning member's form collapses to one section", async () => {
    revealProfileForRegistration.mockResolvedValue({
      ok: true,
      profile: profile({ smallGroupId: "sg1" }),
    })
    renderForm()
    await identifyAsReturningMember()

    expect(screen.getByText("Personal Information")).toBeDefined()
    expect(screen.queryByText("Fill in your details to register for this event.")).toBeNull()
  })

  /** A one-step form has no progress to report, so the counter drops out. */
  it("reports no step count when there is only one step", async () => {
    revealProfileForRegistration.mockResolvedValue({
      ok: true,
      profile: profile({ smallGroupId: "sg1" }),
    })
    renderForm()
    await identifyAsReturningMember()

    expect(screen.queryByText(/^Step \d+ of \d+$/)).toBeNull()
    // Register, not Next: the only step is also the last one.
    expect(screen.getByRole("button", { name: "Register" })).toBeDefined()
  })

  it("still reports progress once there is more than one step", () => {
    renderForm()
    skipGate()

    expect(screen.getByText("Step 1 of 2")).toBeDefined()
  })
})

/**
 * Someone who is already on the list learns it at step 0.
 *
 * Before this, the only thing that told them was a `toast.error` fired after the
 * final Register button — on a form they had just filled in end to end, with no
 * path forward once the toast faded.
 */
describe("already registered", () => {
  /** Step 0 → "Is this you?" → whatever the reveal decided comes next. */
  async function identifyAndWait(text: RegExp) {
    fireEvent.change(screen.getByLabelText(/Mobile Number/), {
      target: { value: "09271418149" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    fireEvent.click(await screen.findByRole("button", { name: "Yes, that's me" }))
    return screen.findByText(text)
  }

  function revealAs(overrides: Record<string, unknown>) {
    revealProfileForRegistration.mockResolvedValue({
      ok: true,
      profile: profile(),
      grant: "grant-token",
      alreadyRegistered: false,
      fieldsStillNeeded: [],
      ...overrides,
    })
  }

  it("says so before the form, not after it", async () => {
    revealAs({ alreadyRegistered: true })
    renderForm()
    await identifyAndWait(/You're already registered/)

    // Not a single form field was put in front of them.
    expect(screen.queryByLabelText(/First Name/)).toBeNull()
    expect(screen.queryByRole("button", { name: "Register" })).toBeNull()
  })

  it("offers a way to change something anyway", async () => {
    revealAs({ alreadyRegistered: true })
    renderForm()
    await identifyAndWait(/You're already registered/)

    expect(screen.getByRole("button", { name: "Update my details" })).toBeDefined()
  })

  it("withholds the update offer when nothing proved the profile was theirs", async () => {
    // No birthday on file means no grant, and amending writes to a registration
    // that already exists — that needs proof, not a mask.
    revealAs({ alreadyRegistered: true, grant: null })
    renderForm()
    await identifyAndWait(/You're already registered/)

    expect(screen.queryByRole("button", { name: "Update my details" })).toBeNull()
    expect(screen.getByRole("button", { name: "Register another person" })).toBeDefined()
  })

  it("asks for a field the event started requiring, and says which", async () => {
    revealAs({ alreadyRegistered: true, fieldsStillNeeded: ["fieldLifeStage"] })
    renderForm({ fieldLifeStage: true, fieldLifeStageRequired: true })
    await identifyAndWait(/We just need one more thing/)

    expect(screen.getByText("Life Stage")).toBeDefined()
    expect(screen.getByRole("button", { name: "Continue" })).toBeDefined()
  })

  it("counts more than one", async () => {
    revealAs({
      alreadyRegistered: true,
      fieldsStillNeeded: ["fieldLifeStage", "fieldGender"],
    })
    renderForm({
      fieldLifeStage: true, fieldLifeStageRequired: true,
      fieldGender: true, fieldGenderRequired: true,
    })
    await identifyAndWait(/We just need 2 more things/)
  })

  /**
   * The narrowing. Someone pulled back in for one field must not be walked through
   * the whole form again — that is the very thing this change set out to stop.
   */
  it("shows only the step holding the field it needs", async () => {
    revealAs({ alreadyRegistered: true, fieldsStillNeeded: ["fieldLifeStage"] })
    renderForm({
      fieldLifeStage: true,
      fieldLifeStageRequired: true,
      sectionDietary: true,
    })
    await identifyAndWait(/We just need one more thing/)
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))

    expect(await screen.findByText("Personal Information")).toBeDefined()
    // Dietary is a step of the ordinary form; an amendment for a life stage has
    // no business reopening it.
    expect(screen.queryByText("Dietary Preferences")).toBeNull()
    expect(screen.queryByText(/^Step \d+ of \d+$/)).toBeNull()
  })

  it("opens the rest of the form on the voluntary path, minus payment", async () => {
    revealAs({ alreadyRegistered: true })
    renderForm({ sectionDietary: true, sectionPayment: true })
    await identifyAndWait(/You're already registered/)
    fireEvent.click(screen.getByRole("button", { name: "Update my details" }))

    expect(await screen.findByText("Personal Information")).toBeDefined()
    // Personal, DGroup and Dietary — but not Payment, which a public form has no
    // business reopening on a registration that already exists.
    expect(screen.getByText("Step 1 of 3")).toBeDefined()
    expect(screen.queryByText("Payment")).toBeNull()
  })

  it("never blocks the walk-in door, which reuses the registration instead", async () => {
    revealAs({ alreadyRegistered: true })
    render(
      <RegistrationForm
        eventId="e1"
        eventName="Sunday Service"
        config={{ ...BARE_EVENT_FORM_CONFIG, sectionSmallGroup: true }}
        walkIn={{ occurrenceId: null, prefill: {} }}
      />
    )
    fireEvent.change(screen.getByLabelText(/Mobile Number/), {
      target: { value: "09271418149" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    fireEvent.click(await screen.findByRole("button", { name: "Yes, that's me" }))

    // Straight into the form. The door reuses the registration and checks them in,
    // so "already registered" is the normal case there, not a refusal.
    expect(await screen.findByRole("button", { name: "Edit details" })).toBeDefined()
    expect(screen.queryByText(/You're already registered/)).toBeNull()
  })
})

/**
 * Dietary and Payment can be marked Required even though they contribute no
 * fields — the section is itself the question. That is what makes "the admin
 * added a dietary question after people registered" reachable by the amend flow.
 */
describe("already registered — a required section", () => {
  async function identifyAndWait(text: RegExp) {
    fireEvent.change(screen.getByLabelText(/Mobile Number/), {
      target: { value: "09271418149" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    fireEvent.click(await screen.findByRole("button", { name: "Yes, that's me" }))
    return screen.findByText(text)
  }

  it("opens the Dietary step and nothing else", async () => {
    revealProfileForRegistration.mockResolvedValue({
      ok: true,
      profile: profile(),
      grant: "grant-token",
      alreadyRegistered: true,
      fieldsStillNeeded: ["sectionDietary"],
    })
    renderForm({ sectionDietary: true, sectionDietaryRequired: true })

    await identifyAndWait(/We just need one more thing/)
    expect(screen.getByText("Dietary Restrictions")).toBeDefined()

    fireEvent.click(screen.getByRole("button", { name: "Continue" }))

    // The Dietary step alone — Personal Information is not reopened for it.
    expect(await screen.findByText("Dietary Preferences")).toBeDefined()
    expect(screen.queryByText(/^Step \d+ of \d+$/)).toBeNull()
  })
})
