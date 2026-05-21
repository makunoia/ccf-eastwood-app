export default function MePage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-xl mx-auto px-4 py-12 space-y-8">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-semibold tracking-tight">Your Profile</h1>
          <p className="text-sm text-muted-foreground">
            GLC progress · small group overview
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            GLC Level 1
          </h2>
          <div className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
            Badges will appear here
          </div>
        </section>

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
