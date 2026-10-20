"use client"

import { Button } from "@/components/ui/button"

export default function InterestError({ reset }: { reset: () => void }) {
  return (
    <div className="space-y-4 p-6" role="alert">
      <h1 className="text-xl font-semibold">Could not load DGroup interest</h1>
      <p className="text-sm text-muted-foreground">Please try again to load the latest requests.</p>
      <Button variant="outline" onClick={reset}>Try again</Button>
    </div>
  )
}
