/**
 * Calls a server action so that a *rejected* promise can never strand a form.
 *
 * Server actions signal expected failures by returning `{ success: false }`, so
 * client code reads the result and moves on. What it does not survive is the
 * promise rejecting: the POST stalls on a phone's flaky connection, the action id
 * is stale after a redeploy, or the action throws outside its own try/catch. Then
 * the line after `await` never runs — including whatever resets the submitting
 * flag — and the button sits disabled on "Submitting…" with no error, forever.
 *
 * Returning `null` instead of throwing turns that into an ordinary branch the
 * caller must handle, right next to the `!result.success` branch it already has.
 */

/** Shown when the request never reached the server (or never came back). */
export const SUBMIT_NETWORK_ERROR =
  "Couldn't reach the server. Check your connection and try again."

export async function callAction<T>(
  fn: () => Promise<T>,
  /** Tag for the console entry — usually the action's name. */
  label = "action"
): Promise<T | null> {
  try {
    return await fn()
  } catch (err) {
    console.error(`[callAction:${label}]`, err)
    return null
  }
}
