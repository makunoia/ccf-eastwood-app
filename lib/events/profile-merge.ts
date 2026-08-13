/**
 * When a registration is allowed to overwrite a stored profile field (CCF-147).
 *
 * The confirmed-member/guest resolvers in `registration-core.ts` have always run
 * **fill-if-empty**: a value already on file wins over whatever the form sent.
 * That rule exists to stop a spelling typed at a registration desk from
 * clobbering data an admin curated, and it has to stay the default.
 *
 * The review screen breaks the assumption behind it. Someone who pulls up their
 * own profile, sees a stale work city, corrects it and submits is not making a
 * typo — they are the authority on that field. Passing their payload through
 * unchanged would silently discard the correction; flipping the rule wholesale
 * would bring back the clobbering.
 *
 * So the overwrite is scoped to fields the person actually **touched**. The form
 * tracks which inputs it edited and names them; everything it didn't name keeps
 * fill-if-empty exactly as before. With no touched set — every caller that
 * existed before this change — the behaviour is identical to what it was.
 */

/** Whether a submitted value counts as something to write at all. */
function isProvided(incoming: unknown): boolean {
  if (incoming === null || incoming === undefined || incoming === "") return false
  if (Array.isArray(incoming)) return incoming.length > 0
  return true
}

/** Whether a stored value counts as already answered. */
function isStored(stored: unknown): boolean {
  if (stored === null || stored === undefined || stored === "") return false
  if (Array.isArray(stored)) return stored.length > 0
  return true
}

/**
 * `field` is the payload key the form uses (`workCity`, `birthYear`, …) — the
 * same vocabulary `touchedFields` is expressed in, so the two can't drift.
 *
 * A touched field with nothing in it is **not** a write: clearing a stored value
 * is a deletion, and a public registration form is not where profile data gets
 * deleted. Someone who wants a field emptied has to ask an admin.
 */
export function shouldWriteProfileField(
  stored: unknown,
  incoming: unknown,
  touched: ReadonlySet<string>,
  field: string
): boolean {
  if (!isProvided(incoming)) return false
  if (touched.has(field)) return true
  return !isStored(stored)
}

/** Normalise the wire format (an optional array) into the lookup the rule wants. */
export function touchedFieldSet(fields?: readonly string[] | null): ReadonlySet<string> {
  return new Set(fields ?? [])
}

/**
 * Raised when an edited mobile or email already belongs to a *different* record.
 *
 * Writing it anyway would give two people the same identifier, which is exactly
 * what the lookup ladder can't resolve — it would start answering "ambiguous"
 * for both of them forever. Refusing the write and naming the reason is the only
 * outcome the person can act on.
 *
 * A distinct class rather than a plain `Error` because the registration actions
 * catch everything and return a generic "please try again"; this one has to
 * survive that and reach the person as itself.
 */
export class ProfileCollisionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ProfileCollisionError"
  }
}
