import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Converts a name string to Title Case (e.g. "JUAN DE LA CRUZ" → "Juan De La Cruz") */
export function toTitleCase(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

/**
 * Normalizes a Philippine mobile number to "+63 9XX XXX XXXX" format.
 * Accepts: 9XXXXXXXXX, 09XXXXXXXXX, 639XXXXXXXXX, or already-formatted +63 numbers.
 * Returns the original string unchanged if the format is unrecognized.
 */
export function formatPhilippinePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  let local: string
  if (digits.startsWith("9") && digits.length === 10) {
    local = digits // already 9XXXXXXXXX
  } else if (digits.startsWith("0") && digits.length === 11) {
    local = digits.slice(1) // drop leading 0 → 9XXXXXXXXX
  } else if (digits.startsWith("63") && digits.length === 12) {
    local = digits.slice(2) // drop country code → 9XXXXXXXXX
  } else {
    return phone.trim()
  }
  return `+63 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`
}
