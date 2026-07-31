import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

import { callAction, SUBMIT_NETWORK_ERROR } from "@/lib/forms/call-action"

/**
 * Regression: the Catch Mech facilitator form sat on "Submitting…" forever.
 *
 * The forms all read `const r = await action(); setSubmitting(false)`. A server
 * action that *returns* `{success:false}` was handled fine — but a REJECTED
 * promise (stalled POST on venue wifi, stale action id after a redeploy, a throw
 * outside the action's own try/catch) skipped every line after the `await`,
 * including the one that re-enables the button. No error, no retry, dead form.
 *
 * callAction converts that rejection into a `null` return so the caller has an
 * ordinary branch to handle, and the line resetting the flag always runs.
 */
describe("callAction", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("passes a resolved value straight through", async () => {
    const result = await callAction(async () => ({ success: true as const, n: 1 }))
    expect(result).toEqual({ success: true, n: 1 })
  })

  it("passes a returned failure through untouched — that is not a rejection", async () => {
    const result = await callAction(async () => ({ success: false as const, error: "nope" }))
    expect(result).toEqual({ success: false, error: "nope" })
  })

  it("returns null instead of rejecting when the action throws", async () => {
    const result = await callAction(async () => {
      throw new Error("Failed to find Server Action")
    })
    expect(result).toBeNull()
  })

  it("returns null when the promise rejects with a non-Error", async () => {
    const result = await callAction(() => Promise.reject("TypeError: Failed to fetch"))
    expect(result).toBeNull()
  })

  it("never throws, so the caller's reset-the-flag line always runs", async () => {
    let submitting = true
    await expect(
      (async () => {
        await callAction(() => Promise.reject(new Error("boom")))
        submitting = false
      })()
    ).resolves.toBeUndefined()
    expect(submitting).toBe(false)
  })

  it("logs the failure under its label so the cause is recoverable from the console", async () => {
    await callAction(() => Promise.reject(new Error("boom")), "submitCatchMechConfirmations")
    expect(console.error).toHaveBeenCalledWith(
      "[callAction:submitCatchMechConfirmations]",
      expect.any(Error)
    )
  })

  it("offers a retry, not a dead end", () => {
    expect(SUBMIT_NETWORK_ERROR).toMatch(/try again/i)
  })
})
