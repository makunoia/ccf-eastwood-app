import dynamic from "next/dynamic"
import type { GlcBookNumber } from "@/components/badges/types"

// Three.js requires browser APIs — disable SSR for the badge row
const GlcBadgeRow = dynamic(
  () => import("@/components/badges/glc-badge-row").then((m) => m.GlcBadgeRow),
  {
    ssr: false,
    loading: () => (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className="aspect-square w-full animate-pulse rounded-full bg-muted" />
        ))}
      </div>
    ),
  }
)

// TODO: replace with real lookup result once /me form is built
const PREVIEW_EARNED: Partial<Record<GlcBookNumber, boolean>> = {
  1: true,
  2: true,
  3: true,
  4: true,
}

export default function MePage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-xl mx-auto px-4 py-12 space-y-8">
        {/* Profile header placeholder */}
        <div className="space-y-0.5">
          <h1 className="text-2xl font-semibold tracking-tight">Your Profile</h1>
          <p className="text-sm text-muted-foreground">
            GLC progress · small group overview
          </p>
        </div>

        {/* GLC badges section */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              GLC Level 1
            </h2>
            <span className="text-xs text-muted-foreground">
              {Object.values(PREVIEW_EARNED).filter(Boolean).length} of 4 completed
            </span>
          </div>

          <div className="rounded-2xl border bg-card p-4">
            <GlcBadgeRow earned={PREVIEW_EARNED} />
          </div>
        </section>

        {/* Small group section placeholder */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Small Group
          </h2>
          <div className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
            Group hierarchy will appear here
          </div>
        </section>
      </div>
    </div>
  )
}
