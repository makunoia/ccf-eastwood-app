/**
 * Shared person-search matching (CCF-115).
 *
 * Every list screen and picker used to build the same filter: one `OR` of
 * `contains` conditions across first name, last name, nickname, phone and email.
 * That matches a single word fine, but typing someone's actual full name —
 * "Maria Santos" — matched nothing, because no single column contains the whole
 * string. Searching by the name a person is known by is the most obvious thing to
 * try, so it failed exactly where it mattered most.
 *
 * The fix is to tokenize the query on whitespace and require **every** token to
 * match **some** field: an AND of ORs rather than one flat OR. "Maria Santos"
 * then matches firstName=Maria plus lastName=Santos, a single word behaves
 * exactly as before, and token order doesn't matter ("Santos Maria" works too).
 *
 * Callers supply their own per-token field list, which keeps Prisma's inference
 * intact and lets relation-nested searches (`{ member: { firstName: … } }`) use
 * the same helper as flat ones.
 */

/**
 * Upper bound on tokens taken from one query. A pasted paragraph would otherwise
 * become a hundred-way AND; ten tokens is far past any real name.
 */
export const MAX_SEARCH_TOKENS = 10

/** Split a query into non-empty search tokens, capped at {@link MAX_SEARCH_TOKENS}. */
export function searchTokens(query: string): string[] {
  return query.trim().split(/\s+/).filter(Boolean).slice(0, MAX_SEARCH_TOKENS)
}

/**
 * Build a Prisma `where` fragment requiring every token in `query` to match at
 * least one of the conditions produced by `fieldsForToken`.
 *
 * Returns `null` for a blank query so callers can fall back to "no filter"
 * however their surrounding `where` is shaped.
 *
 * ```ts
 * const filter = allTokensMatch(search, (t) => [
 *   { firstName: { contains: t, mode: "insensitive" as const } },
 *   { lastName:  { contains: t, mode: "insensitive" as const } },
 * ])
 * ```
 */
export function allTokensMatch<TCondition>(
  query: string,
  fieldsForToken: (token: string) => TCondition[]
): { AND: { OR: TCondition[] }[] } | null {
  const tokens = searchTokens(query)
  if (tokens.length === 0) return null
  return { AND: tokens.map((token) => ({ OR: fieldsForToken(token) })) }
}

/**
 * The standard person field set: the name columns plus the contact columns that
 * identify someone just as well. `prefix` nests the conditions under a relation
 * (`"member"`, `"leader"`, `"guest"`), which is how most list screens search a
 * related person rather than the row itself.
 *
 * Contact fields are included per-token like the rest. A canonical phone number
 * contains spaces ("+63 917 123 4567"), so tokenizing a pasted number yields
 * tokens that are each still a substring of it — the AND holds, and partial
 * numbers keep working.
 */
export type PersonSearchField = "firstName" | "lastName" | "nickname" | "phone" | "email"

export const PERSON_NAME_FIELDS: readonly PersonSearchField[] = [
  "firstName",
  "lastName",
  "nickname",
]

export const PERSON_SEARCH_FIELDS: readonly PersonSearchField[] = [
  "firstName",
  "lastName",
  "nickname",
  "phone",
  "email",
]

/**
 * Per-token conditions over `fields`, optionally nested under a relation.
 * Typed loosely on purpose — call sites cast into the concrete Prisma
 * `…WhereInput` they need, and the shape is pinned by unit tests.
 */
export function personTokenFields(
  token: string,
  fields: readonly PersonSearchField[] = PERSON_SEARCH_FIELDS,
  prefix?: string
): Record<string, unknown>[] {
  const contains = { contains: token, mode: "insensitive" as const }
  return fields.map((field) =>
    prefix ? { [prefix]: { [field]: contains } } : { [field]: contains }
  )
}

/**
 * The common case in one call: match every token against the standard person
 * fields, optionally through a relation.
 */
export function personSearchWhere(
  query: string,
  options: { fields?: readonly PersonSearchField[]; prefix?: string } = {}
): { AND: { OR: Record<string, unknown>[] }[] } | null {
  return allTokensMatch(query, (token) =>
    personTokenFields(token, options.fields, options.prefix)
  )
}
