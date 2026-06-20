import type { ReactNode } from "react"
import type { FormTheme } from "@/lib/forms/config"

/**
 * Branded wrapper for public form pages — banner/primary-color header band with
 * logo, title, description, then the form below. Consolidates the layout that was
 * duplicated across the register / catch-mech / volunteer-info pages.
 */
export function PublicFormShell({
  theme,
  alt = "",
  headerExtra,
  wide = false,
  children,
}: {
  theme: FormTheme
  /** Alt text for the logo image. */
  alt?: string
  /** Optional node rendered under the description (e.g. price, date). */
  headerExtra?: ReactNode
  /** Use a wider form column (max-w-lg) for longer forms. */
  wide?: boolean
  children: ReactNode
}) {
  const { logoUrl, bannerUrl, primaryColor, title, description } = theme
  const hasBg = !!(bannerUrl || primaryColor)

  return (
    <div className="relative min-h-svh bg-muted">
      {bannerUrl && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bannerUrl}
            alt=""
            className="fixed inset-0 h-full w-full object-cover"
          />
          <div className="fixed inset-0 bg-black/50" />
        </>
      )}

      {/* Branded header band */}
      <div
        className="relative px-6 pt-8 pb-16 text-center"
        style={!bannerUrl && primaryColor ? { backgroundColor: primaryColor } : undefined}
      >
        <div className="relative mx-auto w-full max-w-md">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={alt}
              className="mx-auto mb-4 size-20 rounded-xl object-contain"
              style={hasBg ? { backgroundColor: "rgba(255,255,255,0.15)", padding: "0.5rem" } : undefined}
            />
          )}
          {title && (
            <h1 className={`text-2xl font-bold ${hasBg ? "text-white" : ""}`}>{title}</h1>
          )}
          {description && (
            <p className={`mt-1 text-sm ${hasBg ? "text-white/75" : "text-muted-foreground"}`}>
              {description}
            </p>
          )}
          {headerExtra && (
            <div className={hasBg ? "text-white/90" : ""}>{headerExtra}</div>
          )}
        </div>
      </div>

      {/* Form area */}
      <div className="relative z-10 -mt-10 flex items-start justify-center px-4 pb-4">
        <div className={`w-full ${wide ? "max-w-lg" : "max-w-md"}`}>{children}</div>
      </div>
    </div>
  )
}
