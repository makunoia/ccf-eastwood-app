import type { TimeSlot } from "./types"

/**
 * Raw form values for a candidate's preferred meeting slot, as held by the
 * DGroup Matching sections (member/guest detail) and the public join form.
 */
export type CandidateScheduleFields = {
  scheduleDayOfWeek: string // "0"–"6" or ""
  scheduleTimeStart: string // "HH:MM" or ""
  scheduleTimeEnd: string   // "HH:MM" or ""
}

const DAY_START = "00:00"
const DAY_END = "23:59"

function addOneHour(time: string): string {
  const [h, m] = time.split(":").map(Number)
  return `${String((h + 1) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

/** True when none of the three schedule fields is filled in. */
export function isScheduleBlank(fields: CandidateScheduleFields): boolean {
  return (
    fields.scheduleDayOfWeek === "" &&
    fields.scheduleTimeStart === "" &&
    fields.scheduleTimeEnd === ""
  )
}

/**
 * A candidate's schedule is optional and never blocks a search. Blank means
 * "no constraint" — the schedule gate scores an empty candidate slot as
 * *unknown* rather than excluding groups, so leaving it out widens the search.
 *
 * The one thing still worth stopping is a contradiction the admin can see and
 * fix: an end time at or before the start.
 *
 * @returns an error message, or null when the schedule is acceptable.
 */
export function validateOptionalSchedule(fields: CandidateScheduleFields): string | null {
  if (
    fields.scheduleTimeStart !== "" &&
    fields.scheduleTimeEnd !== "" &&
    fields.scheduleTimeStart >= fields.scheduleTimeEnd
  ) {
    return "Schedule end time must be after start time"
  }
  return null
}

/**
 * Normalises a partly-filled schedule into the slot handed to the matching
 * engine and written to storage. One function so the form, the search and the
 * saved record can never disagree.
 *
 * - No day → null. A time range with no day can't be matched against a group's
 *   meeting day, so it places no constraint.
 * - Day only → the whole day ("any time that Tuesday"), which keeps the day
 *   restriction the admin actually chose instead of dropping it.
 * - Day + start → a one-hour slot, the same default the engine already applies
 *   to a stored preference with no end time.
 */
export function buildScheduleSlot(fields: CandidateScheduleFields): TimeSlot | null {
  if (validateOptionalSchedule(fields) !== null) return null

  return buildStoredScheduleSlot(
    fields.scheduleDayOfWeek === "" ? null : Number(fields.scheduleDayOfWeek),
    fields.scheduleTimeStart || null,
    fields.scheduleTimeEnd || null
  )
}

/**
 * The stored-record twin of `buildScheduleSlot` — same normalisation, applied to
 * nullable DB columns (a SmallGroup's inline schedule, a BreakoutGroupSchedule
 * row, a member's SchedulePreference). Meeting times are optional everywhere, so
 * a day-only schedule must still produce a slot the engine can match against.
 */
export function buildStoredScheduleSlot(
  dayOfWeek: number | null | undefined,
  timeStart: string | null | undefined,
  timeEnd: string | null | undefined
): TimeSlot | null {
  if (dayOfWeek == null) return null

  return {
    dayOfWeek,
    timeStart: timeStart || DAY_START,
    timeEnd: timeEnd || (timeStart ? addOneHour(timeStart) : DAY_END),
  }
}
