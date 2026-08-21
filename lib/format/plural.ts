/**
 * `"1 event"` / `"3 events"` / `"2 families"`.
 *
 * The `+ "s"` rule was written out by hand in three places and each copy quietly
 * assumed a regular plural, which is fine until a list of families needs
 * counting. Irregular nouns pass `many` explicitly.
 */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}
