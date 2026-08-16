import type { ReactNode } from "react"
import type { FormTheme } from "@/lib/forms/config"

/**
 * Branded wrapper for public form pages — header band with logo, title and
 * description, then the form card overlapping its bottom edge. Consolidates the
 * layout that was duplicated across the register / catch-mech / volunteer-info
 * pages.
 *
 * Three header treatments, in priority order:
 *   1. banner image  — full-bleed, fixed, behind a scrim
 *   2. primary color — solid band
 *   3. neither       — a soft `primary/[0.07]` tint, the same band the /me portal
 *      uses. Unbranded events used to get *no* band at all, which left the title
 *      floating on the page background and the card overlapping nothing; the
 *      tint keeps the overlap composition intact without inventing a color.
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

  // Stands in for the logo when an event has no artwork of its own, so the
  // header still has something to hang the eye on. First letter of the event
  // name, falling back to the page title.
  const monogram = (alt || title || "").trim().charAt(0).toUpperCase()

  return (
    <div className="relative min-h-svh bg-muted/40">
      {bannerUrl && (
        <>
          {/* Decorative and viewport-sized — never a hit target. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bannerUrl}
            alt=""
            className="pointer-events-none fixed inset-0 h-full w-full object-cover"
          />
          <div className="pointer-events-none fixed inset-0 bg-black/50" />
        </>
      )}

      {/* Header band */}
      <div
        className={`relative px-6 pt-12 pb-20 text-center ${
          hasBg ? "" : "border-b bg-primary/[0.07]"
        }`}
        style={!bannerUrl && primaryColor ? { backgroundColor: primaryColor } : undefined}
      >
        <div className="relative mx-auto w-full max-w-md">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={alt}
              className="mx-auto mb-5 size-20 rounded-2xl object-contain"
              style={
                hasBg
                  ? { backgroundColor: "rgba(255,255,255,0.15)", padding: "0.5rem" }
                  : undefined
              }
            />
          ) : (
            !hasBg &&
            monogram && (
              <div
                aria-hidden="true"
                className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary text-xl font-semibold text-primary-foreground shadow-sm"
              >
                {monogram}
              </div>
            )
          )}
          {title && (
            <h1
              className={`text-2xl font-semibold tracking-tight text-balance ${
                hasBg ? "text-white" : "text-foreground"
              }`}
            >
              {title}
            </h1>
          )}
          {description && (
            <p
              className={`mt-2 text-sm leading-6 text-pretty ${
                hasBg ? "text-white/75" : "text-muted-foreground"
              }`}
            >
              {description}
            </p>
          )}
          {headerExtra && <div className={hasBg ? "text-white/90" : ""}>{headerExtra}</div>}
        </div>
      </div>

      {/* Form area — cards overlap the band's bottom edge. The descendant rules
          soften every card a public form renders in one place, so the surfaces
          read as one family instead of each page restyling its own. */}
      <div className="relative z-10 -mt-12 flex items-start justify-center px-4 pb-12">
        <div
          className={`w-full **:data-[slot=card]:rounded-2xl **:data-[slot=card]:shadow-sm ${
            wide ? "max-w-lg" : "max-w-md"
          }`}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
