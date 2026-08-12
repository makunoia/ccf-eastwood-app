import Link from "next/link"
import {
  IconDeviceMobileCheck,
  IconUserPlus,
  IconUsersGroup,
} from "@tabler/icons-react"

import {
  clusterCheckinClosedHint,
  clusterCheckinManageLabel,
  type ClusterCheckinShortcut,
} from "@/lib/clusters/checkin-shortcuts"
import { formatOccurrenceDate } from "@/lib/format/occurrence"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

/**
 * The day's links, gathered on the board a staffer is already holding.
 *
 * The check-in page monitors arrivals but records none — attendance happens on
 * each event's own public form. Offering walk-in registration alone made it read
 * as though walk-in were the only door, so every event's check-in link (and the
 * session it opens) sits here beside it.
 *
 * The public form links open in a new tab, the one place in the app that does so
 * besides the bus manifest. This board is a live monitor a staffer keeps up for
 * the whole day, and the forms it points at are worked in long stretches — one
 * walk-in after another. Navigating away in place meant surrendering the board on
 * every trip to the door and rebuilding it on the way back. The admin links below
 * (fix a closed form, open a session) stay in-tab: those are ordinary navigation
 * inside the workspace, not a second surface to keep open.
 */

const TYPE_LABEL: Record<ClusterCheckinShortcut["eventType"], string> = {
  OneTime: "One-time",
  MultiDay: "Multi-day",
  Recurring: "Recurring",
}

/**
 * Sighted users get the new tab as it happens; a screen reader user gets it in
 * the link's name, before they commit to following it.
 */
function NewTabHint() {
  return <span className="sr-only">(opens in a new tab)</span>
}

export function ClusterCheckinShortcuts({
  shortcuts,
  checkInHref,
  checkInSettingsHref,
  walkInHref,
  walkInSettingsHref,
  canConfigure,
}: {
  shortcuts: ClusterCheckinShortcut[]
  /** The day's own kiosk — null without write access, or while it's closed. */
  checkInHref: string | null
  /** Where to open the kiosk's switch, when it's closed. */
  checkInSettingsHref: string | null
  /** Door link for someone who isn't registered yet — null without write access. */
  walkInHref: string | null
  /** Where to open the walk-in switch, when the door is closed (CCF-133). */
  walkInSettingsHref: string | null
  /**
   * Whether to point at the admin screens that fix a closed link. Read-only
   * staff get the reason without a link they can't act on.
   */
  canConfigure: boolean
}) {
  const anyDoor =
    checkInHref || checkInSettingsHref || walkInHref || walkInSettingsHref
  if (shortcuts.length === 0 && !anyDoor) return null

  return (
    <div className="space-y-2">
      <h3 className="type-label text-muted-foreground">Shortcuts</h3>
      <div className="space-y-2">
        {/* The day's kiosk leads: it finds a person once and records every event
            they're registered for, so it is what a staffer reaches for first.
            The per-event links below remain the fallback for an event it can't
            cover, and walk-in the exception for someone not registered at all. */}
        <DoorRow
          title="Day check-in"
          description="Finds someone once and checks them in across the day's events"
          closedDescription="Nobody can check in at the day's kiosk until it's opened"
          icon={<IconUsersGroup className="size-4" />}
          href={checkInHref}
          settingsHref={checkInSettingsHref}
          settingsLabel="Open it on the Check-in form"
        />

        {shortcuts.map((shortcut) => (
          <ShortcutRow key={shortcut.eventId} shortcut={shortcut} canConfigure={canConfigure} />
        ))}

        {/* Walk-in covers the whole day in one pass, so it sits after the
            per-event links rather than standing in for them. */}
        <DoorRow
          title="Walk-in registration"
          description="Registers and checks someone in across the day's events at once"
          closedDescription="Nobody can register at the door until it's opened"
          icon={<IconUserPlus className="size-4" />}
          href={walkInHref}
          settingsHref={walkInSettingsHref}
          settingsLabel="Open it on the Walk-in form"
        />
      </div>
    </div>
  )
}

/**
 * A day-wide public door: the link when it's open, the switch when it isn't, and
 * nothing at all for staff who may not act on either. Never both, so the row can
 * never dead-end.
 */
function DoorRow({
  title,
  description,
  closedDescription,
  icon,
  href,
  settingsHref,
  settingsLabel,
}: {
  title: string
  description: string
  closedDescription: string
  icon: React.ReactNode
  href: string | null
  settingsHref: string | null
  settingsLabel: string
}) {
  if (href) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0">
          {/* Both day-wide doors show a button reading "Open", so the name is
              spelled out here rather than assembled from sr-only spans: naming
              which door keeps them apart for anyone who hears the link instead
              of seeing the row it sits in. */}
          <Link
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${title} (opens in a new tab)`}
          >
            {icon}
            Open
          </Link>
        </Button>
      </div>
    )
  }

  if (!settingsHref) return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed px-4 py-3">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-medium">
          {title}
          <Badge variant="outline">Closed</Badge>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{closedDescription}</p>
      </div>
      <Link
        href={settingsHref}
        className="shrink-0 text-sm font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 transition-colors hover:decoration-foreground"
      >
        {settingsLabel}
      </Link>
    </div>
  )
}

function ShortcutRow({
  shortcut,
  canConfigure,
}: {
  shortcut: ClusterCheckinShortcut
  canConfigure: boolean
}) {
  const { status } = shortcut
  const sessionLabel = shortcut.sessionDate
    ? formatOccurrenceDate(shortcut.sessionDate)
    : null
  const closed = status === "open" ? null : status

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 ${
        closed ? "border-dashed" : ""
      }`}
    >
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-medium">
          <span className="truncate">{shortcut.eventName}</span>
          {closed && <Badge variant="outline">Closed</Badge>}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {[
            TYPE_LABEL[shortcut.eventType],
            sessionLabel,
            closed && clusterCheckinClosedHint(closed),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      {shortcut.href ? (
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <Link href={shortcut.href} target="_blank" rel="noopener noreferrer">
            <IconDeviceMobileCheck className="size-4" />
            Check-in
            <NewTabHint />
          </Link>
        </Button>
      ) : closed && canConfigure ? (
        <Link
          href={shortcut.manageHref}
          className="shrink-0 text-sm font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 transition-colors hover:decoration-foreground"
        >
          {clusterCheckinManageLabel(closed)}
        </Link>
      ) : null}
    </div>
  )
}
