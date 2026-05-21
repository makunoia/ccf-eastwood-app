export type GlcBookNumber = 1 | 2 | 3 | 4

export type GlcBookConfig = {
  number: GlcBookNumber
  title: string
  /** Main disc face color (metallic mid-tone) */
  color: string
  /** Outer ring highlight color (brighter) */
  ringColor: string
  /** Subtle emissive glow (dark version of color) */
  emissive: string
}

// Colors sampled from the GLC Level 1 book covers
export const GLC_BOOKS: Record<GlcBookNumber, GlcBookConfig> = {
  1: {
    number: 1,
    title: "One by One",
    color: "#B87810",
    ringColor: "#F0C030",
    emissive: "#604000",
  },
  2: {
    number: 2,
    title: "Spiritual Disciplines",
    color: "#507810",
    ringColor: "#84B030",
    emissive: "#283C08",
  },
  3: {
    number: 3,
    title: "The Holy Spirit",
    color: "#981040",
    ringColor: "#D83060",
    emissive: "#500028",
  },
  4: {
    number: 4,
    title: "CCF DNA",
    color: "#0E5898",
    ringColor: "#2880D0",
    emissive: "#062C50",
  },
}
