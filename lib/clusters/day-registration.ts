/**
 * What a person's existing `EventRegistrant` row means when they submit a
 * cluster's shared registration form.
 *
 * Pure, and its own module, so the rule can be unit-tested without a database
 * and read without unpicking the fan-out around it.
 *
 * ## The problem it settles
 *
 * `EventRegistrant` is one row per person per event **series**. A weekly Youth
 * service's regular therefore already holds a row on that event — one made
 * months ago, for nothing to do with any particular date. Treating that row as
 * "already registered" is right for a Parallel day, where the person ticked that
 * event and the day is simply a shared wrapper around each event's own
 * registration, but it is wrong for a **Collab**.
 *
 * A Collab is two ministries co-running *one* event, and the day owns it: the
 * breakout tables are cluster-owned and start empty, the member events' standing
 * tables are untouched and unused, and the roster is the day's. So the day's
 * registrant list has to start **fresh** — built by the people who actually come
 * through the day's form — rather than inherited from whoever happens to sit on
 * either ministry's series list.
 *
 * Inheriting it had a visible cost, not just a conceptual one: every regular of
 * either ministry short-circuited on their old row, so the submission created
 * nothing, seated them at no table on the day, and reported an outcome that
 * described a registration made long before the day existed.
 *
 * ## The three answers
 *
 * - `"create"` — no row on this event yet. Register them.
 * - `"reuse"` — a row exists, but it isn't this day's. Do the day's work on top
 *   of it: stamp the provenance, merge the answers just given, place them at one
 *   of the day's tables. The row is reused rather than duplicated because the
 *   underlying event must not gain a second registration for one person.
 * - `"already"` — the row is already this day's, so the person is on the list and
 *   there is nothing left to do. Re-running placement here would re-file work
 *   that already happened.
 *
 * Identity lookup is untouched by any of this: the mobile-number step still
 * resolves people against the whole Member and Guest pool. "Fresh list" is about
 * which *registrations* count for the day, never about who we can recognise.
 */
export type ClusterDayRegistrationDisposition = "create" | "reuse" | "already"

export function clusterDayRegistrationDisposition(
  isCollab: boolean,
  existing: { registrationClusterId: string | null } | null,
  clusterId: string
): ClusterDayRegistrationDisposition {
  if (!existing) return "create"
  // A Parallel day registers people for the member events themselves, so an
  // existing registration on one of them is exactly the thing being asked for.
  if (!isCollab) return "already"
  return existing.registrationClusterId === clusterId ? "already" : "reuse"
}
