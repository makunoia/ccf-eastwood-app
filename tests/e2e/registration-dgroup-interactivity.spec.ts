import { test, expect, startFormManually } from "./fixtures/registration-event"
import type { Page } from "@playwright/test"

/**
 * CCF-145 — the DGroup Info step's checkboxes and buttons didn't respond to taps
 * until the browser window was resized.
 *
 * Root cause: @radix-ui/react-dismissable-layer tracks the body pointer-events lock
 * in a module-level variable gated on a Set's size, so overlapping modal layers that
 * unmount out of order can leave `body { pointer-events: none }` behind. Resizing
 * "fixed" it only because @radix-ui/react-select registers
 * `window.addEventListener("resize", close)` on itself — the one code path in the
 * stack that force-closes a stranded layer.
 *
 * These specs never resize and never force a reflow. If the lock leaks, they fail.
 */

/** The inline style Radix writes; `getComputedStyle` would also see CSS defaults. */
async function bodyPointerEventsLock(page: Page) {
  return page.evaluate(() => document.body.style.pointerEvents)
}

async function gotoDGroupStep(page: Page, registerPath: string) {
  // Past the CCF-147 mobile-number gate — these specs are about the DGroup step.
  await startFormManually(page, registerPath)
  await page.getByLabel("First Name").fill("Juan")
  await page.getByLabel("Last Name").fill("dela Cruz")
  await page.getByRole("button", { name: "Next", exact: true }).click()
  await expect(page.getByText("DGroup Info")).toBeVisible()
}

test.describe("CCF-145 — DGroup Info step stays interactive", () => {
  test("the first tap on the step toggles a checkbox, with no resize", async ({
    page,
    dgroupEvent,
  }) => {
    await gotoDGroupStep(page, dgroupEvent.registerPath)

    // The very first interaction on the step — this is the one that was dead.
    const wants = page.getByRole("checkbox", { name: "I want to join a DGroup" })
    await wants.click()

    await expect(wants).toBeChecked()
    expect(await bodyPointerEventsLock(page)).not.toBe("none")
  })

  test("both checkboxes stay mutually exclusive and responsive", async ({
    page,
    dgroupEvent,
  }) => {
    await gotoDGroupStep(page, dgroupEvent.registerPath)

    const wants = page.getByRole("checkbox", { name: "I want to join a DGroup" })
    const already = page.getByRole("checkbox", { name: "I'm already part of a DGroup" })

    await wants.click()
    await expect(wants).toBeChecked()

    await already.click()
    await expect(already).toBeChecked()
    await expect(wants).not.toBeChecked()

    expect(await bodyPointerEventsLock(page)).not.toBe("none")
  })

  test("stepping back and forward leaves the page interactive", async ({
    page,
    dgroupEvent,
  }) => {
    // Step changes unmount the outgoing step's whole subtree, Radix layers included.
    // That teardown is what stranded the lock.
    await gotoDGroupStep(page, dgroupEvent.registerPath)
    await page.getByRole("button", { name: "Back", exact: true }).click()
    await expect(page.getByText("Personal Information")).toBeVisible()
    await page.getByRole("button", { name: "Next", exact: true }).click()
    await expect(page.getByText("DGroup Info")).toBeVisible()

    const wants = page.getByRole("checkbox", { name: "I want to join a DGroup" })
    await wants.click()

    await expect(wants).toBeChecked()
    expect(await bodyPointerEventsLock(page)).not.toBe("none")
  })

  test("closing the Language menu does not strand the body lock", async ({
    page,
    dgroupEvent,
  }) => {
    await gotoDGroupStep(page, dgroupEvent.registerPath)
    await page.getByRole("checkbox", { name: "I want to join a DGroup" }).click()

    const language = page.getByRole("button", { name: "Select language(s)" })
    await language.click()
    await expect(page.getByRole("menu")).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("menu")).toBeHidden()

    expect(await bodyPointerEventsLock(page)).not.toBe("none")

    // And the page is still usable afterwards.
    const already = page.getByRole("checkbox", { name: "I'm already part of a DGroup" })
    await already.click()
    await expect(already).toBeChecked()
  })

  test("opening a Select straight from the open Language menu leaves no lock", async ({
    page,
    dgroupEvent,
  }) => {
    // Two overlapping modal layers is the exact shape that trips Radix's accounting:
    // the menu is still mid-close when the Select's layer registers itself.
    await gotoDGroupStep(page, dgroupEvent.registerPath)
    await page.getByRole("checkbox", { name: "I want to join a DGroup" }).click()

    await page.getByRole("button", { name: "Select language(s)" }).click()
    await expect(page.getByRole("menu")).toBeVisible()

    // Meeting Preference is the step's first Select; the schedule day and work city
    // Selects follow it. Bound by position so the locator survives the value changing.
    const meetingPreference = page.getByRole("combobox").first()
    await meetingPreference.click()
    await page.keyboard.press("Escape")

    await expect(page.getByRole("menu")).toBeHidden()
    expect(await bodyPointerEventsLock(page)).not.toBe("none")

    const already = page.getByRole("checkbox", { name: "I'm already part of a DGroup" })
    await already.click()
    await expect(already).toBeChecked()
  })

  test("picking a value from a Select leaves the step interactive", async ({
    page,
    dgroupEvent,
  }) => {
    await gotoDGroupStep(page, dgroupEvent.registerPath)
    await page.getByRole("checkbox", { name: "I want to join a DGroup" }).click()

    // Meeting Preference is the step's first Select; the schedule day and work city
    // Selects follow it. Bound by position so the locator survives the value changing.
    const meetingPreference = page.getByRole("combobox").first()
    await meetingPreference.click()
    await page.getByRole("option", { name: "Online" }).click()
    await expect(meetingPreference).toContainText("Online")

    expect(await bodyPointerEventsLock(page)).not.toBe("none")

    const already = page.getByRole("checkbox", { name: "I'm already part of a DGroup" })
    await already.click()
    await expect(already).toBeChecked()
  })
})
