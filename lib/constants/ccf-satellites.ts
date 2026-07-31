/**
 * CCF satellites in the Philippines, sourced from https://www.ccf.org.ph/where-we-are/
 * (the site's `location` post type, grouped by its `location-categories` taxonomy —
 * Philippines_MetroManila / _Luzon / _Visayas / _Mindanao). A handful of PH
 * satellites are untagged on the site and were placed by their known city.
 *
 * Overseas satellites are deliberately excluded — this list only backs the
 * "leader is from another CCF satellite" option on the DGroup form.
 */

export const HOME_SATELLITE = "CCF Eastwood"

export type SatelliteRegion =
  | "Metro Manila"
  | "Luzon"
  | "Visayas"
  | "Mindanao"

export const CCF_SATELLITES_BY_REGION: { region: SatelliteRegion; satellites: string[] }[] = [
  {
    region: "Metro Manila",
    satellites: [
      "CCF Alabang",
      "CCF Angono",
      "CCF Antipolo",
      "CCF Bay Area",
      "CCF BGC",
      "CCF Center – Main",
      "CCF Commonwealth",
      "CCF Eastwood",
      "CCF Fairview",
      "CCF Feliz",
      "CCF Gateway",
      "CCF Grace Park",
      "CCF Katipunan",
      "CCF Las Pinas",
      "CCF Lower Antipolo",
      "CCF Makati",
      "CCF Manila",
      "CCF Marikina",
      "CCF Muntinlupa",
      "CCF North Edsa",
      "CCF Paranaque",
      "CCF Robinsons Place Antipolo",
      "CCF Sandoval",
      "CCF Tandang Sora",
      "CCF Valenzuela",
    ],
  },
  {
    region: "Luzon",
    satellites: [
      "CCF Alicia",
      "CCF Angeles",
      "CCF Bacoor",
      "CCF Baguio",
      "CCF Baliuag",
      "CCF Bataan",
      "CCF Batangas City",
      "CCF Binangonan",
      "CCF Cabanatuan",
      "CCF Calamba",
      "CCF Cauayan",
      "CCF Dagupan",
      "CCF East Ortigas",
      "CCF General Trias",
      "CCF Imus",
      "CCF Kawit",
      "CCF La Trinidad",
      "CCF La Union",
      "CCF Legazpi",
      "CCF Lipa",
      "CCF Lucena",
      "CCF Malolos",
      "CCF Marilao",
      "CCF Molino",
      "CCF Naga",
      "CCF Puerto Princesa",
      "CCF Salitran",
      "CCF San Fernando",
      "CCF San Jose Del Monte",
      "CCF San Pedro",
      "CCF San Simon",
      "CCF Santa Maria",
      "CCF Santa Rosa",
      "CCF Santiago",
      "CCF Silang",
      "CCF Subic Bay",
      "CCF Tagaytay",
      "CCF Tanay",
      "CCF Tarlac",
      "CCF Taytay",
      "CCF Tuguegarao",
      "CCF Urdaneta",
    ],
  },
  {
    region: "Visayas",
    satellites: [
      "CCF Bacolod",
      "CCF Cebu",
      "CCF Dumaguete",
      "CCF Iloilo",
      "CCF Roxas",
    ],
  },
  {
    region: "Mindanao",
    satellites: [
      "CCF Butuan",
      "CCF CDO Downtown",
      "CCF CDO Uptown",
      "CCF Davao",
      "CCF Dipolog",
      "CCF General Santos",
      "CCF Iligan",
      "CCF Malaybalay",
      "CCF Manolo Fortich",
      "CCF Matina",
      "CCF Ozamiz",
      "CCF Tagum",
      "CCF Valencia",
    ],
  },
]

/** Every Philippine satellite, including this app's own ({@link HOME_SATELLITE}). */
export const CCF_SATELLITES: string[] = CCF_SATELLITES_BY_REGION.flatMap(
  (r) => r.satellites
)

/**
 * The satellites offered when a DGroup leader reports to a leader outside CCF
 * Eastwood. Eastwood itself is omitted — a leader there belongs to a parent
 * DGroup in this app, not to an external satellite.
 */
export const EXTERNAL_SATELLITES_BY_REGION = CCF_SATELLITES_BY_REGION.map((r) => ({
  region: r.region,
  satellites: r.satellites.filter((s) => s !== HOME_SATELLITE),
})).filter((r) => r.satellites.length > 0)

export const EXTERNAL_SATELLITES: string[] = EXTERNAL_SATELLITES_BY_REGION.flatMap(
  (r) => r.satellites
)

const EXTERNAL_SATELLITE_SET = new Set(EXTERNAL_SATELLITES)

/** True when `name` is a Philippine satellite other than CCF Eastwood. */
export function isExternalSatellite(name: string): boolean {
  return EXTERNAL_SATELLITE_SET.has(name)
}

/** The region a satellite sits in, or `null` when the name is unknown. */
export function regionForSatellite(name: string): SatelliteRegion | null {
  return (
    CCF_SATELLITES_BY_REGION.find((r) => r.satellites.includes(name))?.region ??
    null
  )
}
