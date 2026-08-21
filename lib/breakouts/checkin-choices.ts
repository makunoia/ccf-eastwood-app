import type {
  BreakoutCandidate,
  BreakoutNoticeKind,
  BreakoutPickerOption,
} from "@/lib/breakout-suggestion"

/**
 * What the check-in kiosk needs in order to offer someone a breakout group.
 *
 * A pure type module because both halves of the boundary import it: the server
 * action that builds it (`getCheckinBreakoutChoices`) and the two client boards
 * that render it. It can't live in the `"use server"` file — every export there
 * has to be an async function.
 *
 * It is **pre-ranked**. Unlike the registration form, which re-ranks on every
 * keystroke because the person is answering gender and life stage as they go, the
 * kiosk resolves the profile once, server-side, from the Member or Guest record
 * that already exists. Nothing about the ordering can change while the step is on
 * screen, so shipping candidates plus a profile to a public page — and re-running
 * the matcher in a browser — would buy nothing and leak both.
 */
export type CheckinBreakoutChoices = {
  /** The best-fitting group, already chosen by `suggestBreakoutGroup`. */
  suggested: BreakoutCandidate | null
  /** Every group this person may browse, emptiest first. */
  options: BreakoutPickerOption[]
  /**
   * Whether any group survived the facilitator gate at all, before filtering to
   * this person. Distinct from `options.length`, which can be zero because their
   * gender rules every table out — a different thing to say.
   */
  hasCandidates: boolean
  /** Why the list is empty, when that's worth explaining. */
  notice: BreakoutNoticeKind | null
  /**
   * The group this person is already sitting in, if any. Non-null means the step
   * is skipped entirely: check-in is not where someone re-picks a table they were
   * placed in at registration, or by an admin since.
   */
  seatedGroupName: string | null
}
