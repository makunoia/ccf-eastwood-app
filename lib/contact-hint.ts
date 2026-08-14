/**
 * Masked contact details for public, unauthenticated surfaces.
 *
 * Search and disambiguation screens on public pages (check-in, catch-mech
 * follow-up) have to let someone tell two same-named people apart without
 * publishing either person's phone or email to whoever opened the link. Showing
 * the last four digits does that: it means nothing to a stranger and is instantly
 * recognisable to the person it belongs to.
 *
 * Every public surface uses these helpers rather than its own masking, so a
 * change to how much is revealed happens in exactly one place.
 */

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  return `+63 ••• ••• ${digits.slice(-4)}`
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@")
  if (!domain) return "•••"
  return `${local.slice(0, 1)}•••@${domain}`
}

/**
 * `Maria Santos` → `M••• S•••`.
 *
 * For the registration form's "Is this you?" card (CCF-147), which is reached by
 * typing a mobile number into a public form — so it can be reached by typing
 * *anyone's* mobile number. The initials are enough for the real owner to
 * recognise themselves and useless to someone fishing for who owns a number.
 *
 * Every word is masked, not just the first two: middle names and suffixes are
 * part of the identity too, and leaving a trailing "Jr." unmasked would leak the
 * one token most likely to be distinctive.
 */
export function maskName(...parts: (string | null | undefined)[]): string {
  const masked = parts
    .filter((p): p is string => !!p)
    .flatMap((p) => p.trim().split(/\s+/))
    .filter(Boolean)
    .map((word) => `${word.slice(0, 1)}•••`)
  return masked.length > 0 ? masked.join(" ") : "•••"
}

/** Phone wins over email — it's the identifier people recognise fastest. */
export function contactHintFrom(phone: string | null, email: string | null): string | null {
  if (phone) return maskPhone(phone)
  if (email) return maskEmail(email)
  return null
}
