/**
 * How an event's ministry affiliation reads to a person.
 *
 * Three distinct states, so the label can't collapse them: `allMinistries` is a
 * church-wide event, a list of names is those ministries, and neither is a
 * ministry-agnostic event that simply says nothing.
 */
export function ministryLabel(
  allMinistries: boolean,
  ministryNames: string[]
): string {
  if (allMinistries) return "All Ministries"
  return ministryNames.join(" · ")
}
