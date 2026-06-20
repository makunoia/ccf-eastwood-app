import { IconLock } from "@tabler/icons-react"

/**
 * Shown on a public form page when its FormConfig is closed (isOpen = false).
 * Generic, no custom copy (per product decision).
 */
export function FormClosed({
  title = "This form is currently unavailable",
}: {
  title?: string
}) {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md text-center space-y-4">
        <div className="flex justify-center">
          <div className="rounded-full bg-muted p-3">
            <IconLock className="size-6 text-muted-foreground" />
          </div>
        </div>
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">
            Please check back later or contact the church office for assistance.
          </p>
        </div>
      </div>
    </div>
  )
}
