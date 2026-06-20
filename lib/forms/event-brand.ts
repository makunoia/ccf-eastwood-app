/**
 * Resolve an event's effective brand (logo + primary color), honoring the
 * "use ministry brand" toggle. Shared by all public event form pages so the
 * branding fallback is computed identically everywhere.
 */
export type EventBrandInput = {
  useMinistryBrand: boolean
  brandMinistryId: string | null
  logoUrl: string | null
  themeColorPrimary: string | null
  ministries: {
    ministry: { id: string; logoUrl: string | null; themeColorPrimary: string | null }
  }[]
}

export function resolveEventBrand(event: EventBrandInput): {
  logoUrl: string | null
  primaryColor: string | null
} {
  if (event.useMinistryBrand && event.brandMinistryId) {
    const ministry = event.ministries.find((em) => em.ministry.id === event.brandMinistryId)
    return {
      logoUrl: ministry?.ministry.logoUrl ?? null,
      primaryColor: ministry?.ministry.themeColorPrimary ?? null,
    }
  }
  return {
    logoUrl: event.logoUrl ?? null,
    primaryColor: event.themeColorPrimary ?? null,
  }
}
