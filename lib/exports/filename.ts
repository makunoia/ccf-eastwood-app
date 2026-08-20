/**
 * Export filenames: `<slug>-<suffix>-<yyyy-mm-dd>`.
 *
 * A downloaded CSV outlives the screen it came from — an admin opens it a week
 * later in a folder of twenty others. Naming it after the event and the date is
 * what makes it findable; `registrants-<cuid>.csv` is not.
 */
export function exportFilename(name: string, suffix: string, date?: Date | null): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || suffix
  const stamp = (date ?? new Date()).toISOString().split("T")[0]
  return `${slug}-${suffix}-${stamp}`
}
