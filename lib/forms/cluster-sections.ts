import type { ClusterKind } from "@/app/generated/prisma/client"
import { FORM_TOGGLE_KEYS, type FormToggleKey } from "./context-config"

/**
 * Which of the form builder's sections a cluster's shared form can't offer.
 *
 * Three are out on every kind of day: payment isn't taken on a shared form (a
 * priced event can't join a cluster at all), and household capture doesn't fan
 * out across member events.
 *
 * Breakout depends on the kind, and follows exactly where cluster-owned tables
 * exist. A **Collab** day owns its own tables (CCF-148), so it can offer the same
 * suggested-table-plus-dropdown step a single event offers. A **Parallel** day is
 * several independent events that happen to share a date, each running its own
 * standing tables, and a registrant may tick any number of them — there is no one
 * set to pick from, which is the same reason `/cluster/[id]/breakouts` 404s there.
 *
 * Shared by the Registration and Walk-in builder pages so the two can't drift.
 */
export function clusterNotApplicableToggles(kind: ClusterKind): FormToggleKey[] {
  return [
    "sectionPayment",
    "sectionFamily",
    "familySpouseOnly",
    ...(kind === "Collab" ? [] : (["sectionBreakout"] as FormToggleKey[])),
  ]
}

/** Whether the shared form offers a breakout step at all on this kind of day. */
export function clusterOffersBreakoutStep(kind: ClusterKind): boolean {
  return kind === "Collab"
}

/**
 * The same question for the day's **check-in kiosk**, whose answer is much
 * narrower than the shared form's.
 *
 * `ClusterCheckinBoard` is a deliberately lean sibling of the per-event board: it
 * is name → tap → check me in, with no DGroup prompt, no profile form and no
 * household step. Every toggle those would drive is therefore inapplicable here —
 * not "off by default" but *unhonoured*, which is worse to offer than to hide,
 * because ticking it would change nothing and say otherwise.
 *
 * That leaves `sectionBreakout` as the only toggle the kiosk can act on, and only
 * on a Collab: a Parallel day owns no tables of its own, exactly as
 * {@link clusterOffersBreakoutStep} says.
 *
 * Derived from `FORM_TOGGLE_KEYS` by subtraction rather than listed, so a toggle
 * added later is inapplicable here until someone deliberately teaches the kiosk
 * about it.
 */
export function clusterCheckInNotApplicableToggles(kind: ClusterKind): FormToggleKey[] {
  const applicable: FormToggleKey[] =
    kind === "Collab" ? ["sectionBreakout"] : []
  return FORM_TOGGLE_KEYS.filter((key) => !applicable.includes(key))
}
