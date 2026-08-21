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
 * the day's kiosk, or on each event's own public form. Offering walk-in
 * registration alone made it read as though walk-in were the only door, so the
 * kiosk and (on a Parallel day) every event's check-in link sit here beside it.
 *
 * **Two zones, and they are ordered by scope, not by fallback.** The day-wide
 * doors — kiosk, then walk-in — come first as a pair, because they are what a
 * staffer reaches for; the per-event links are a second group below, for the one
 * event the kiosk can't cover. They used to be interleaved (kiosk, events,
 * walk-in), which put the day's two doors at opposite ends of a stack of rows
 * belonging to something else. Every row is a fixed-height cell in the same
 * two-up grid, so the whole section is one band above the arrivals list instead
 * of a column of full-width boxes pushing it off the screen.
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
  /**
   * Per-event check-in links. Empty on a Collab day, where the caller drops them:
   * the day is one event wearing two ministries' names, so there is nothing for a
   * per-event door to mean.
   */
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
      <div className="grid gap-2 sm:grid-cols-2">
        {/* The day's kiosk leads: it finds a person once and records every event
            they're registered for, so it is what a staffer reaches for first.
            Walk-in is its pair — the same day-wide scope, for someone who isn't
            registered at all. */}
        <DoorRow
          title="Day check-in"
          closedDescription="Nobody can check in at the day's kiosk until it's opened"
          icon={<IconUsersGroup className="size-4" />}
          href={checkInHref}
          settingsHref={checkInSettingsHref}
          settingsLabel="Open it on the Check-in form"
        />

        <DoorRow
          title="Walk-in registration"
          closedDescription="Nobody can register at the door until it's opened"
          icon={<IconUserPlus className="size-4" />}
          href={walkInHref}
          settingsHref={walkInSettingsHref}
          settingsLabel="Open it on the Walk-in form"
        />

        {shortcuts.map((shortcut) => (
          <ShortcutRow key={shortcut.eventId} shortcut={shortcut} canConfigure={canConfigure} />
        ))}
      </div>
    </div>
  )
}

/**
 * The shell every row shares, so a door and an event cell line up in the grid:
 * the label on the left, one control on the right, `h-full` so a closed cell
 * carrying a reason doesn't leave its neighbour short.
 */
function ShortcutShell({
  closed,
  label,
  control,
}: {
  closed: boolean
  label: React.ReactNode
  control: React.ReactNode
}) {
  return (
    <div
      className={`flex h-full items-center justify-between gap-3 rounded-lg border px-3 py-2 ${
        closed ? "border-dashed" : ""
      }`}
    >
      <div className="min-w-0">{label}</div>
      {control}
    </div>
  )
}

/** Same underlined treatment the app uses for an in-workspace fix-it link. */
function ManageLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="shrink-0 text-sm font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 transition-colors hover:decoration-foreground"
    >
      {children}
    </Link>
  )
}

/**
 * A day-wide public door: the link when it's open, the switch when it isn't, and
 * nothing at all for staff who may not act on either. Never both, so the row can
 * never dead-end.
 *
 * An open door carries no description. "Day check-in" and "Walk-in registration"
 * say what they are to the staffer running the day, and a line of onboarding copy
 * under each one is read once and then occupies the top of the screen forever. A
 * *closed* door still explains itself: there the sentence is the reason, not a
 * description, and it's what sends the staffer to the right switch.
 */
function DoorRow({
  title,
  closedDescription,
  icon,
  href,
  settingsHref,
  settingsLabel,
}: {
  title: string
  closedDescription: string
  icon: React.ReactNode
  href: string | null
  settingsHref: string | null
  settingsLabel: string
}) {
  if (href) {
    return (
      <ShortcutShell
        closed={false}
        label={
          <p className="flex items-center gap-2 text-sm font-medium">
            <span aria-hidden className="text-muted-foreground">
              {icon}
            </span>
            <span className="truncate">{title}</span>
          </p>
        }
        control={
          <Button asChild variant="outline" size="sm" className="h-7 shrink-0">
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
              Open
            </Link>
          </Button>
        }
      />
    )
  }

  if (!settingsHref) return null

  return (
    <ShortcutShell
      closed
      label={
        <>
          <p className="flex items-center gap-2 text-sm font-medium">
            <span className="truncate">{title}</span>
            <Badge variant="outline">Closed</Badge>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{closedDescription}</p>
        </>
      }
      control={<ManageLink href={settingsHref}>{settingsLabel}</ManageLink>}
    />
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
    <ShortcutShell
      closed={Boolean(closed)}
      label={
        <>
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
        </>
      }
      control={
        shortcut.href ? (
          <Button asChild variant="outline" size="sm" className="h-7 shrink-0">
            <Link href={shortcut.href} target="_blank" rel="noopener noreferrer">
              <IconDeviceMobileCheck className="size-4" />
              Check-in
              <NewTabHint />
            </Link>
          </Button>
        ) : closed && canConfigure ? (
          <ManageLink href={shortcut.manageHref}>
            {clusterCheckinManageLabel(closed)}
          </ManageLink>
        ) : null
      }
    />
  )
}
