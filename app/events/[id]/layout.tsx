import type { Metadata } from "next"
import type { ReactNode } from "react"
import { getEventLogoUrl, eventIcons } from "@/lib/metadata"

// Injects the per-event favicon for every public event page (register, checkin,
// catch-mech, volunteer). Child pages still set their own titles; icons resolved
// here are inherited and fall back to the app-wide favicon when the event has no logo.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const logoUrl = await getEventLogoUrl(id)
  return { icons: eventIcons(logoUrl) }
}

export default function PublicEventLayout({ children }: { children: ReactNode }) {
  return children
}
