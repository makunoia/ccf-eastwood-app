import { isProfileEmpty, profileRows, type BreakoutMatchingProfile } from "@/lib/breakouts/profile"
import { FIELD_META } from "@/components/matching/factor-meta"

/**
 * A breakout group's matching profile, read-only.
 *
 * Four factors, four columns — life stage, gender focus, language, age range.
 * This replaced a label/value `<dl>` of eight rows, most of them reading "Any":
 * with the DGroup-only factors gone there is little enough left to show it all
 * at a glance instead of making an admin read down a list. Each factor carries
 * its icon and colour from `FIELD_META`, the same ones the Settings priorities
 * screen and the per-factor match breakdown use, so a factor looks the same
 * everywhere it appears.
 *
 * The factors are laid out on bare card surface, not in bordered tiles: this
 * block sits inside the group's profile card, and a bordered tile inside a card
 * is a nested card (DESIGN.md §Cards). Alignment comes from the grid.
 */

function Factor({
  factorKey,
  label,
  value,
}: {
  factorKey: "lifeStage" | "gender" | "language" | "age"
  label: string
  value: string
}) {
  const { icon: Icon, color } = FIELD_META[factorKey]
  // "Any" is a real answer — it means "matches everyone" — but it is not the
  // interesting one, so it reads quieter than a value someone chose.
  const isAny = value === "Any"

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <Icon
          className="size-3.5 shrink-0"
          style={{ color: isAny ? "hsl(var(--muted-foreground))" : color }}
        />
        <p className="type-label truncate text-muted-foreground">{label}</p>
      </div>
      <p
        className={[
          "mt-1.5 text-sm leading-snug",
          isAny ? "text-muted-foreground" : "font-medium",
        ].join(" ")}
        title={value}
      >
        {value}
      </p>
    </div>
  )
}

export function MatchingProfileGrid({ profile }: { profile: BreakoutMatchingProfile }) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
      {profileRows(profile).map((row) => (
        <Factor key={row.key} factorKey={row.key} label={row.label} value={row.value} />
      ))}
    </div>
  )
}

export function MatchingProfile({
  profile,
  heading = "Matching Profile",
  /** Rendered under the factors — normally the facilitator's DGroup leadership. */
  footnote,
}: {
  profile: BreakoutMatchingProfile
  heading?: string
  footnote?: React.ReactNode
}) {
  // A group with nothing set gets one sentence, not four "Any" columns — the
  // admin needs to see at a glance that there is nothing to match on yet.
  const empty = isProfileEmpty(profile)

  return (
    <div className="space-y-3">
      <p className="type-label text-muted-foreground">{heading}</p>

      {empty ? (
        <p className="text-sm text-muted-foreground">
          No matching criteria yet — use Edit to set them.
        </p>
      ) : (
        <MatchingProfileGrid profile={profile} />
      )}

      {footnote}
    </div>
  )
}
