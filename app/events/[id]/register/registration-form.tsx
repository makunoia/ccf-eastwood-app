"use client"

import * as React from "react"
import Link from "next/link"
import { IconCheck } from "@tabler/icons-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import {
  BARE_EVENT_FORM_CONFIG,
  formLayoutFor,
  resolveSuccessMessage,
  type EventFormConfigData,
  type FormFieldKey,
} from "@/lib/forms/context-config"
import {
  askedFieldsFor,
  missingRequiredFields,
  requiredFieldsMessage,
} from "@/lib/forms/registration-payload"
import type { FormContext } from "@/app/generated/prisma/client"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { ScheduleInput } from "@/components/ui/schedule-input"
import { Label } from "@/components/ui/label"
import { MultiSelect } from "@/components/ui/multi-select"
import { OptionalEmailInput } from "@/components/ui/optional-email-input"
import { OptionalPhonePHInput } from "@/components/ui/optional-phone-ph-input"
import { BirthMonthYearInput } from "@/components/ui/birth-month-year-input"
import { PrivacyPolicyCheckbox } from "@/components/ui/privacy-policy-checkbox"
import { PersonCombobox } from "@/components/ui/person-combobox"
import { EXTERNAL_SATELLITES_BY_REGION } from "@/lib/constants/ccf-satellites"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  createRegistrant,
  createHouseholdRegistration,
  lookupMemberForRegistration,
} from "@/app/(dashboard)/events/actions"
import type { AssignedBreakout } from "@/lib/events/registration-core"
import {
  registerForCluster,
  type ClusterEventRegistrationResult,
} from "@/app/(dashboard)/events/cluster-actions"
import { searchMembersForLeaderLookup } from "@/app/(dashboard)/guests/actions"
import { clampFormStep } from "@/lib/forms/step-navigation"
import { LANGUAGE_OPTIONS, CITY_OPTIONS } from "@/lib/constants/group-options"
import { FAMILY_ROLES, FAMILY_ROLE_LABELS, type FamilyRoleValue } from "@/lib/validations/family"
import {
  MAX_HOUSEHOLD_MEMBERS,
  defaultHouseholdMember,
  type HouseholdFormMember,
} from "@/lib/validations/household"
import {
  suggestBreakoutGroup,
  breakoutPickerOptions,
  type BreakoutCandidate,
  type BreakoutNoticeKind,
} from "@/lib/breakout-suggestion"
import { breakoutOccupancy } from "@/lib/breakouts/occupancy"

const DAY_NAMES = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"]
const MEETING_FORMAT_LABEL: Record<"Online" | "Hybrid" | "InPerson", string> = {
  Online: "Online",
  Hybrid: "Hybrid",
  InPerson: "In Person",
}

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return time
  const period = h >= 12 ? "PM" : "AM"
  const display = h % 12 || 12
  return `${display}:${m.toString().padStart(2, "0")} ${period}`
}

const BREAKOUT_NOTICE_COPY: Record<BreakoutNoticeKind, { title: string; body: string }> = {
  "awaiting-facilitator": {
    title: "No breakout groups are open yet",
    body: "Groups appear here once their facilitator has checked in. Go ahead and finish registering — a staff member will place you in a group.",
  },
}

type Step = "form" | "confirm" | "disambiguate" | "early-confirm" | "early-disambiguate" | "done" | "volunteer-blocked"

type LifeStage = { id: string; name: string }
type AgeRangeBucket = { id: string; label: string }

type DietaryValue =
  | ""
  | "Vegetarian"
  | "Vegan"
  | "Halal"
  | "Kosher"
  | "GlutenFree"
  | "DairyFree"
  | "NutFree"
  | "Pescatarian"
  | "Other"

type FormValues = {
  firstName: string
  lastName: string
  nickname: string
  email: string
  mobileNumber: string
  birthMonth: string
  birthYear: string
  ageRangeBucketId: string
  lifeStageId: string
  gender: string
  language: string[]
  meetingPreference: string
  workCity: string
  scheduleDayOfWeek: string
  scheduleTimeStart: string
  scheduleTimeEnd: string
  dietaryPreference: DietaryValue
  dietaryOther: string
  paymentReference: string
}

type MatchedMember = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  matchedBy: "mobile" | "email" | "nameBirthday"
  recordType: "member" | "guest"
  isVolunteer?: boolean
  // Member-only extended fields (present when recordType === "member" and early lookup was used)
  smallGroupId?: string | null
  groupStatus?: string | null
  lifeStageId?: string | null
  language?: string[]
  meetingPreference?: string | null
  workCity?: string | null
  schedulePreferences?: { dayOfWeek: number; timeStart: string }[]
}

type AmbiguousCandidate = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  recordType: "member" | "guest"
  isVolunteer?: boolean
  smallGroupId?: string | null
  groupStatus?: string | null
  lifeStageId?: string | null
  language?: string[]
  meetingPreference?: string | null
  workCity?: string | null
  schedulePreferences?: { dayOfWeek: number; timeStart: string }[]
}

const defaultForm: FormValues = {
  firstName: "",
  lastName: "",
  nickname: "",
  email: "",
  mobileNumber: "",
  birthMonth: "",
  birthYear: "",
  ageRangeBucketId: "",
  lifeStageId: "",
  gender: "",
  language: [],
  meetingPreference: "",
  workCity: "",
  scheduleDayOfWeek: "",
  scheduleTimeStart: "",
  scheduleTimeEnd: "",
  dietaryPreference: "",
  dietaryOther: "",
  paymentReference: "",
}

const DIETARY_OPTIONS: { value: Exclude<DietaryValue, "">; label: string }[] = [
  { value: "Vegetarian", label: "Vegetarian" },
  { value: "Vegan", label: "Vegan" },
  { value: "Halal", label: "Halal" },
  { value: "Kosher", label: "Kosher" },
  { value: "GlutenFree", label: "Gluten-Free" },
  { value: "DairyFree", label: "Dairy-Free" },
  { value: "NutFree", label: "Nut-Free" },
  { value: "Pescatarian", label: "Pescatarian" },
  { value: "Other", label: "Other" },
]


// Walk-in mode (check-in kiosk): the check-in board sends people here when a
// lookup finds no registration, so the registration page itself is the single
// source of truth for the form. Same steps as public registration — the person
// is registered via createRegistrant(..., walkIn) and checked in immediately.
type WalkInConfig = {
  occurrenceId: string | null
  prefill: {
    mobileNumber?: string
    email?: string
    firstName?: string
    lastName?: string
    birthMonth?: string
    birthYear?: string
  }
  // Where "Back" / "Done" returns to — the check-in board this walk-in came from.
  backHref: string
}

// Cluster mode (CCF-132): the shared "Event Day" form. Identity + profile are
// collected once, an Events step asks which of the day's events the person is
// attending, and submission fans out one registration per selected event.
type ClusterConfig = {
  token: string
  events: { id: string; name: string; meta?: string | null }[]
}

type Props = {
  eventId?: string
  eventName?: string
  /**
   * Which sections and fields this context collects (CCF-119/120). Omitted →
   * bare: only the mandatory identity fields.
   */
  config?: Partial<EventFormConfigData>
  /**
   * Admin-configured success screen sub copy (CCF-130). Null/omitted falls back
   * to the built-in default for this context.
   */
  successMessage?: string | null
  lifeStages?: LifeStage[]
  /** Configurable age brackets (CCF-123), shown when the Age Range field is on. */
  ageRanges?: AgeRangeBucket[]
  defaultLifeStageId?: string
  breakoutCandidates?: BreakoutCandidate[]
  /**
   * Why the breakout list is empty, when that is worth saying out loud. The step
   * renders with an explanation instead of disappearing — see `BreakoutNotice`.
   */
  breakoutNotice?: BreakoutNoticeKind | null
  // "plain" drops the Card chrome so the form can be embedded inside another
  // container (e.g. the check-in board's card).
  frame?: "card" | "plain"
  walkIn?: WalkInConfig
  /** Cluster shared form — exactly one of eventId / cluster is provided. */
  cluster?: ClusterConfig
}

// Card wrapper that can render chrome-less for embedding. Defined at module
// level so its identity is stable across renders (inputs keep focus).
function FormShell({
  plain,
  className,
  ...props
}: React.ComponentProps<typeof Card> & { plain?: boolean }) {
  if (plain) {
    return <div className={cn("flex flex-col gap-6 py-6", className)} {...props} />
  }
  return <Card className={className} {...props} />
}

/**
 * The `*` next to a required field's label (CCF-142), matching how First and
 * Last Name have always marked themselves. Renders nothing when the field is
 * optional, so an all-optional form looks exactly as it did before.
 */
function RequiredMark({ on }: { on: boolean }) {
  if (!on) return null
  return <span className="text-destructive">*</span>
}

export function RegistrationForm({
  eventId,
  eventName = "",
  config,
  successMessage = null,
  lifeStages = [],
  ageRanges = [],
  defaultLifeStageId = "",
  breakoutCandidates = [],
  breakoutNotice = null,
  frame = "card",
  walkIn,
  cluster,
}: Props) {
  const plain = frame === "plain"
  const cfg = React.useMemo<EventFormConfigData>(
    () => ({ ...BARE_EVENT_FORM_CONFIG, ...config }),
    [config]
  )
  const formContext: FormContext = walkIn ? "WalkIn" : "Register"
  const includeSmallGroup = cfg.sectionSmallGroup
  const includeDietary = cfg.sectionDietary
  const includePayment = cfg.sectionPayment
  const [step, setStep] = React.useState<Step>("form")
  const [form, setForm] = React.useState<FormValues>({
    ...defaultForm,
    lifeStageId: defaultLifeStageId,
    // Walk-in mode: seed from the failed check-in lookup. Fields stay editable —
    // the person may be fixing the typo that caused the miss.
    mobileNumber: walkIn?.prefill.mobileNumber ?? "",
    email: walkIn?.prefill.email ?? "",
    firstName: walkIn?.prefill.firstName ?? "",
    lastName: walkIn?.prefill.lastName ?? "",
    birthMonth: walkIn?.prefill.birthMonth ?? "",
    birthYear: walkIn?.prefill.birthYear ?? "",
  })
  // A field this form doesn't collect starts out as "they don't have one", so the
  // member-lookup branches below (which read `!noMobile && form.mobileNumber`)
  // degrade to the identifier that *is* being asked for, rather than looking up
  // against a value nobody was given the chance to enter.
  const [noMobile, setNoMobile] = React.useState(!cfg.fieldMobile)
  const [noEmail, setNoEmail] = React.useState(!cfg.fieldEmail)
  const [smallGroupIntent, setSmallGroupIntent] = React.useState<null | "wants" | "already_in">(null)
  const [claimedSmallGroupId, setClaimedSmallGroupId] = React.useState("")
  // "…and my DGroup is at another CCF satellite" — swaps the leader search for a
  // satellite picker, since there's no local group to find.
  const [claimedElsewhere, setClaimedElsewhere] = React.useState(false)
  const [claimedSatellite, setClaimedSatellite] = React.useState("")
  const [claimedGroupQuery, setClaimedGroupQuery] = React.useState("")
  const [claimedGroupResults, setClaimedGroupResults] = React.useState<Array<{ id: string; name: string; leaderName: string }>>([])
  const [claimedGroupSearching, setClaimedGroupSearching] = React.useState(false)
  const claimedGroupDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Monotonic id so only the newest leader lookup is allowed to set state. */
  const claimedGroupRequestRef = React.useRef(0)
  const satelliteOptions = React.useMemo(
    () =>
      EXTERNAL_SATELLITES_BY_REGION.flatMap(({ region, satellites }) =>
        satellites.map((name) => ({ value: name, label: name, hint: region }))
      ),
    []
  )
  const [submitting, setSubmitting] = React.useState(false)
  const [matchedMember, setMatchedMember] = React.useState<MatchedMember | null>(null)
  const [confirmedMember, setConfirmedMember] = React.useState<MatchedMember | null>(null)
  const [skipSmallGroup, setSkipSmallGroup] = React.useState(false)
  const [candidates, setCandidates] = React.useState<{
    matchedBy: "mobile" | "email"
    items: AmbiguousCandidate[]
  } | null>(null)
  const [selectedBreakoutId, setSelectedBreakoutId] = React.useState<string>("")
  const [assignedBreakout, setAssignedBreakout] = React.useState<AssignedBreakout | null>(null)
  // Cluster mode: which of the day's events the person is attending, and the
  // per-event outcomes shown on the success screen (partial success).
  const [selectedEventIds, setSelectedEventIds] = React.useState<string[]>([])
  const [clusterResults, setClusterResults] = React.useState<ClusterEventRegistrationResult[] | null>(null)
  const [formStep, setFormStep] = React.useState(1)
  const [privacyAccepted, setPrivacyAccepted] = React.useState(false)
  const [primaryRole, setPrimaryRole] = React.useState<FamilyRoleValue>("FatherHusband")
  const [householdMembers, setHouseholdMembers] = React.useState<HouseholdFormMember[]>([])

  // Spouse-only mode keeps a single slot in `householdMembers` so the submit
  // path is identical to full-household mode. The spouse's role is the opposite
  // half of the couple rather than something the person picks.
  const spouseRole: FamilyRoleValue =
    primaryRole === "FatherHusband" ? "MotherWife" : "FatherHusband"
  const spouse = householdMembers[0] ?? defaultHouseholdMember
  function setSpouseField(field: keyof HouseholdFormMember, value: string) {
    setHouseholdMembers((prev) => {
      const current = prev[0] ?? { ...defaultHouseholdMember }
      return [{ ...current, [field]: value, role: spouseRole }]
    })
  }
  const cardRef = React.useRef<HTMLDivElement>(null)

  // A notice keeps the step on screen with nothing to pick. Silently dropping it
  // is what made the walk-in form look broken: the admin had switched Breakout
  // on, and the step still wasn't there.
  const hasBreakoutChoices = breakoutCandidates.length > 0
  const showBreakoutSection = hasBreakoutChoices || breakoutNotice !== null

  const suggestedBreakout = React.useMemo(() => {
    if (!hasBreakoutChoices) return null
    return suggestBreakoutGroup(breakoutCandidates, {
      gender: (form.gender || null) as "Male" | "Female" | null,
      birthYear: form.birthYear ? parseInt(form.birthYear, 10) : null,
    })
  }, [breakoutCandidates, form.gender, form.birthYear, hasBreakoutChoices])

  // Every group in the room, unfiltered — the profile only drives the suggestion
  // above, never what the registrant is allowed to browse.
  const browsableCandidates = React.useMemo(
    () => breakoutPickerOptions(breakoutCandidates),
    [breakoutCandidates]
  )

  // Occupancy travels only to staffed surfaces, so its presence — not the
  // `walkIn` prop — is what decides whether headcounts render and whether a full
  // group can be chosen anyway. The page that fetched the data made that call.
  const suggestedOccupancy = React.useMemo(
    () => (suggestedBreakout?.occupancy ? breakoutOccupancy(suggestedBreakout.occupancy) : null),
    [suggestedBreakout]
  )

  const selectedOccupancy = React.useMemo(
    () => browsableCandidates.find((g) => g.id === selectedBreakoutId)?.occupancyView ?? null,
    [browsableCandidates, selectedBreakoutId]
  )

  React.useEffect(() => {
    return () => {
      if (claimedGroupDebounceRef.current) clearTimeout(claimedGroupDebounceRef.current)
      // Any reply still in flight belongs to a form that no longer exists.
      claimedGroupRequestRef.current += 1
    }
  }, [])

  function handleClaimedGroupQueryChange(value: string) {
    setClaimedGroupQuery(value)
    setClaimedSmallGroupId("")
    if (claimedGroupDebounceRef.current) clearTimeout(claimedGroupDebounceRef.current)
    // Debouncing alone doesn't order the replies: a slow lookup for an earlier
    // query can land after a fast one for the current query and overwrite it —
    // or clear the spinner the newer request is still using, which is what left
    // the step sitting on "Searching…" with results that didn't match the box.
    const requestId = (claimedGroupRequestRef.current += 1)
    claimedGroupDebounceRef.current = setTimeout(async () => {
      if (value.trim().length < 2) {
        setClaimedGroupResults([])
        return
      }
      setClaimedGroupSearching(true)
      const res = await searchMembersForLeaderLookup(value.trim())
      if (claimedGroupRequestRef.current !== requestId) return
      setClaimedGroupSearching(false)
      if (res.success) {
        setClaimedGroupResults(
          res.data.flatMap((m) =>
            m.ledGroups.map((g) => ({
              id: g.id,
              name: g.name,
              leaderName: `${m.firstName} ${m.lastName}`,
            }))
          )
        )
      }
    }, 300)
  }

  const sections: { key: string; title: string }[] = [
    { key: "personal", title: "Personal Information" },
    ...(cluster ? [{ key: "events", title: "Events" }] : []),
    ...(includeSmallGroup && !skipSmallGroup ? [{ key: "smallgroup", title: "DGroup Info" }] : []),
    ...(showBreakoutSection ? [{ key: "breakout", title: "Breakout Group" }] : []),
    ...(cfg.sectionFamily ? [{ key: "household", title: "Your Household" }] : []),
    ...(includeDietary ? [{ key: "dietary", title: "Dietary Preferences" }] : []),
    ...(includePayment ? [{ key: "payment", title: "Payment" }] : []),
  ]
  const isMultiStep = sections.length > 1
  // `sections` is derived from config *and* from answers given along the way, so it
  // can shrink under the step we're standing on — confirming as a member who already
  // has a DGroup drops that step. Every read goes through the clamp, and the
  // navigation handlers below step relative to it, so a stale `formStep` heals on
  // the next move instead of throwing mid-render.
  const safeStep = clampFormStep(formStep, sections.length)
  const currentSectionKey = sections[safeStep - 1].key

  /**
   * The current answers keyed the way the payload is, so the client can run the
   * same `missingRequiredFields` the server does instead of a parallel list of
   * checks that would drift from it.
   *
   * `noMobile`/`noEmail` collapse to empty here: someone who has ticked "I don't
   * have one" has not answered, whatever is still sitting in state.
   */
  const answers = React.useMemo(
    () => ({
      nickname: form.nickname,
      mobileNumber: noMobile ? "" : form.mobileNumber,
      email: noEmail ? "" : form.email,
      lifeStageId: form.lifeStageId,
      birthMonth: form.birthMonth,
      birthYear: form.birthYear,
      ageRangeBucketId: form.ageRangeBucketId,
      gender: form.gender,
      language: form.language,
      meetingPreference: form.meetingPreference,
      workCity: form.workCity,
      scheduleDayOfWeek: form.scheduleDayOfWeek,
      wantsSmallGroup: smallGroupIntent === "wants",
    }),
    [form, noMobile, noEmail, smallGroupIntent]
  )

  /** Required fields left blank in one step, in the order they're rendered. */
  function missingInSection(stepKey: string): FormFieldKey[] {
    const layoutKey = stepKey === "personal" ? "personal" : "sectionSmallGroup"
    if (stepKey !== "personal" && stepKey !== "smallgroup") return []
    const section = formLayoutFor(formContext).find((s) => s.key === layoutKey)
    if (!section) return []
    return missingRequiredFields(
      cfg,
      answers,
      section.fields.filter((f) => askedFieldsFor(formContext, answers).includes(f))
    )
  }

  // Scrolling in the same tick as `setFormStep` measured the *outgoing* step's
  // geometry and then smooth-scrolled against a document whose height changed
  // underneath the animation. Do it after the commit instead — and never on first
  // paint, so the page doesn't scroll itself on load.
  const didMountRef = React.useRef(false)
  React.useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true
      return
    }
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [formStep])

  function handleReset() {
    setStep("form")
    setForm({ ...defaultForm, lifeStageId: defaultLifeStageId })
    // Back to the same starting point as a fresh mount, not to false — a form
    // that doesn't collect mobile must not come back from a reset acting as
    // though the next person simply hasn't typed their number in yet.
    setNoMobile(!cfg.fieldMobile)
    setNoEmail(!cfg.fieldEmail)
    setSmallGroupIntent(null)
    setClaimedSmallGroupId("")
    setClaimedGroupQuery("")
    setClaimedGroupResults([])
    setMatchedMember(null)
    setConfirmedMember(null)
    setSkipSmallGroup(false)
    setCandidates(null)
    setSelectedBreakoutId("")
    setAssignedBreakout(null)
    setSelectedEventIds([])
    setClusterResults(null)
    setFormStep(1)
    setPrivacyAccepted(false)
  }

  function toggleSelectedEvent(id: string) {
    setSelectedEventIds((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]
    )
  }

  function set(field: keyof FormValues, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleNext() {
    // A half-filled household row would otherwise be silently dropped at submit,
    // leaving someone thinking they registered a family member who wasn't saved.
    if (currentSectionKey === "household") {
      const partial = householdMembers.some(
        (m) =>
          (m.firstName.trim() || m.lastName.trim()) &&
          !(m.firstName.trim() && m.lastName.trim())
      )
      if (partial) {
        toast.error("Give every household member both a first and last name, or remove them.")
        return
      }
    }

    // Cluster mode: the day makes no sense with nothing ticked.
    if (currentSectionKey === "events" && selectedEventIds.length === 0) {
      toast.error("Select at least one event to register for.")
      return
    }

    // The DGroup step's matching fields. Only reachable — and only checked —
    // when the person said they're looking for a group; `askedFieldsFor` drops
    // them otherwise.
    if (currentSectionKey === "smallgroup") {
      const missingGroup = missingInSection("smallgroup")
      if (missingGroup.length > 0) {
        toast.error(requiredFieldsMessage(missingGroup))
        return
      }
    }

    if (safeStep === 1) {
      if (!form.firstName.trim()) {
        toast.error("First name is required.")
        return
      }
      if (!form.lastName.trim()) {
        toast.error("Last name is required.")
        return
      }
      // Same check the server runs, so a required field fails here — while the
      // input is still on screen — rather than after the last step.
      const missingPersonal = missingInSection("personal")
      if (missingPersonal.length > 0) {
        toast.error(requiredFieldsMessage(missingPersonal))
        return
      }

      // Early member lookup before the Small Group step so we can adapt the form
      if (includeSmallGroup) {
        const hasMobile = !noMobile && !!form.mobileNumber
        const hasEmail = !noEmail && !!form.email
        const hasBirthday = !!form.birthMonth && !!form.birthYear

        if (hasMobile || hasEmail || hasBirthday) {
          setSubmitting(true)
          const match = await lookupMemberForRegistration({
            mobileNumber: hasMobile ? form.mobileNumber : null,
            email: hasEmail ? form.email : null,
            lastName: hasBirthday ? form.lastName : null,
            birthMonth: hasBirthday ? parseInt(form.birthMonth, 10) : null,
            birthYear: hasBirthday ? parseInt(form.birthYear, 10) : null,
            // Cluster mode has no single event: volunteer conflicts are per-event
            // partial results at submit time, not an up-front block.
            eventId: cluster ? null : eventId,
          })
          setSubmitting(false)

          if (match) {
            if ("matchType" in match && match.matchType === "ambiguous") {
              setCandidates({ matchedBy: match.matchedBy, items: match.candidates })
              setStep("early-disambiguate")
              return
            }
            setMatchedMember(match as MatchedMember)
            setStep("early-confirm")
            return
          }
        }
      }
    }
    setFormStep(clampFormStep(safeStep + 1, sections.length))
  }

  function handleEarlyReject() {
    setMatchedMember(null)
    setCandidates(null)
    setStep("form")
    setFormStep(2)
  }

  function handleEarlyConfirm(match: MatchedMember) {
    if (match.isVolunteer) {
      setMatchedMember(match)
      setCandidates(null)
      setStep("volunteer-blocked")
      return
    }

    setConfirmedMember(match)

    // Pre-fill matching fields from member's existing data
    if (match.recordType === "member") {
      setForm((prev) => ({
        ...prev,
        lifeStageId: match.lifeStageId || prev.lifeStageId,
        language: match.language && match.language.length > 0 ? match.language : prev.language,
        meetingPreference: match.meetingPreference || prev.meetingPreference,
        workCity: match.workCity || prev.workCity,
        scheduleDayOfWeek:
          match.schedulePreferences && match.schedulePreferences.length > 0
            ? match.schedulePreferences[0].dayOfWeek.toString()
            : prev.scheduleDayOfWeek,
        scheduleTimeStart:
          match.schedulePreferences && match.schedulePreferences.length > 0
            ? match.schedulePreferences[0].timeStart
            : prev.scheduleTimeStart,
      }))
    }

    const willSkipSmallGroup = match.recordType === "member" && !!match.smallGroupId
    if (willSkipSmallGroup) {
      setSkipSmallGroup(true)
    }

    // Auto-check "wants small group" for confirmed members who don't have one yet
    if (match.recordType === "member" && !match.smallGroupId) {
      setSmallGroupIntent("wants")
    }

    setMatchedMember(null)
    setStep("form")

    // Compute the new section count to decide whether to advance or submit
    const newSectionsCount = [
      true,
      !!cluster,
      includeSmallGroup && !willSkipSmallGroup,
      showBreakoutSection,
      cfg.sectionFamily,
      includeDietary,
      includePayment,
    ].filter(Boolean).length

    if (newSectionsCount === 1) {
      // Personal info is the only remaining step — register directly
      register(
        match.recordType === "member" ? match.id : null,
        match.recordType === "guest" ? match.id : null
      )
      return
    }

    setFormStep(2)
  }

  function handleBack() {
    setFormStep(clampFormStep(safeStep - 1, sections.length))
  }

  async function handleSubmit(e?: React.FormEvent | React.MouseEvent) {
    e?.preventDefault()

    if (!privacyAccepted) {
      toast.error("Please agree to the CCF Privacy Policy to continue")
      return
    }

    if (cluster && selectedEventIds.length === 0) {
      toast.error("Select at least one event to register for.")
      return
    }

    if (!isMultiStep) {
      if (!form.firstName.trim() || !form.lastName.trim()) {
        toast.error("First and last name are required.")
        return
      }
    }

    setSubmitting(true)

    // Fast-path: member was already confirmed in the early lookup step
    if (confirmedMember) {
      await register(
        confirmedMember.recordType === "member" ? confirmedMember.id : null,
        confirmedMember.recordType === "guest" ? confirmedMember.id : null
      )
      return
    }

    const hasMobile = !noMobile && !!form.mobileNumber
    const hasEmail = !noEmail && !!form.email
    const hasBirthday = !!form.birthMonth && !!form.birthYear

    if (hasMobile || hasEmail || hasBirthday) {
      const match = await lookupMemberForRegistration({
        mobileNumber: hasMobile ? form.mobileNumber : null,
        email: hasEmail ? form.email : null,
        lastName: hasBirthday ? form.lastName : null,
        birthMonth: hasBirthday ? parseInt(form.birthMonth, 10) : null,
        birthYear: hasBirthday ? parseInt(form.birthYear, 10) : null,
        eventId: cluster ? null : eventId,
      })
      setSubmitting(false)
      if (match) {
        if ("matchType" in match && match.matchType === "ambiguous") {
          setCandidates({ matchedBy: match.matchedBy, items: match.candidates })
          setStep("disambiguate")
          return
        }
        setMatchedMember(match as MatchedMember)
        setStep("confirm")
        return
      }
    } else {
      setSubmitting(false)
    }

    await register(null)
  }

  async function register(
    confirmedMemberId: string | null,
    confirmedGuestId?: string | null,
    skipDeduplication?: boolean
  ) {
    setSubmitting(true)
    const includeMatching = includeSmallGroup && smallGroupIntent === "wants"
    const registrantPayload = {
        firstName: form.firstName,
        lastName: form.lastName,
        nickname: cfg.fieldNickname ? form.nickname : null,
        email: form.email,
        mobileNumber: form.mobileNumber,
        // A disabled field must never submit a value, even one seeded into state
        // (e.g. defaultLifeStageId) or left over from a since-hidden step.
        birthMonth: cfg.fieldBirthDate && form.birthMonth ? parseInt(form.birthMonth, 10) : null,
        birthYear: cfg.fieldBirthDate && form.birthYear ? parseInt(form.birthYear, 10) : null,
        ageRangeBucketId: cfg.fieldAgeRange ? form.ageRangeBucketId || null : null,
        // Life Stage lives in Personal Information now, so it is not conditional on
        // the DGroup step or on the person wanting a group.
        lifeStageId: cfg.fieldLifeStage ? form.lifeStageId || null : null,
        gender: (cfg.fieldGender ? form.gender || null : null) as "Male" | "Female" | null,
        language: includeMatching && cfg.fieldLanguage ? form.language : [],
        meetingPreference:
          includeMatching && cfg.fieldMeetingPreference
            ? ((form.meetingPreference || null) as "Online" | "Hybrid" | "InPerson" | null)
            : null,
        workCity: includeMatching && cfg.fieldWorkCity ? form.workCity || null : null,
        scheduleDayOfWeek:
          includeMatching && cfg.fieldSchedule && form.scheduleDayOfWeek !== ""
            ? parseInt(form.scheduleDayOfWeek, 10)
            : null,
        scheduleTimeStart:
          includeMatching && cfg.fieldSchedule ? form.scheduleTimeStart || null : null,
        scheduleTimeEnd:
          includeMatching && cfg.fieldSchedule ? form.scheduleTimeEnd || null : null,
        claimedSmallGroupId:
          includeSmallGroup && smallGroupIntent === "already_in" && !claimedElsewhere
            ? claimedSmallGroupId || null
            : null,
        claimedSatellite:
          includeSmallGroup && smallGroupIntent === "already_in" && claimedElsewhere
            ? claimedSatellite || null
            : null,
        // The intent itself is submitted now, not just used to reveal the
        // matching questions — the server turns it into a DGroup request (CCF-101).
        wantsSmallGroup: includeSmallGroup && smallGroupIntent === "wants",
        dietaryPreference: includeDietary
          ? form.dietaryPreference === ""
            ? null
            : form.dietaryPreference
          : null,
        dietaryOther:
          includeDietary && form.dietaryPreference === "Other" ? form.dietaryOther || null : null,
        paymentReference: includePayment ? form.paymentReference || null : null,
    }

    // Cluster mode resolves the person once server-side, then fans out one
    // registration per selected event — outcomes come back per event.
    if (cluster) {
      const result = await registerForCluster(
        cluster.token,
        registrantPayload,
        confirmedMemberId,
        confirmedGuestId,
        skipDeduplication,
        selectedEventIds,
        walkIn ? true : undefined
      )
      setSubmitting(false)
      if (result.success) {
        setClusterResults(result.data.results)
        setStep("done")
      } else {
        toast.error(result.error)
      }
      return
    }

    // Household mode registers everyone in one call and links them to a Family;
    // otherwise this is an ordinary single-person registration.
    const result = cfg.sectionFamily
      ? await createHouseholdRegistration(
          eventId!,
          registrantPayload,
          {
            primaryRole,
            familyName: null,
            members: householdMembers
              .filter((m) => m.firstName.trim() && m.lastName.trim())
              .map((m) => ({
                firstName: m.firstName,
                lastName: m.lastName,
                nickname: m.nickname || null,
                role: m.role,
                birthMonth: m.birthMonth ? parseInt(m.birthMonth, 10) : null,
                birthYear: m.birthYear ? parseInt(m.birthYear, 10) : null,
                gender: (m.gender || null) as "Male" | "Female" | null,
                ageRangeBucketId: m.ageRangeBucketId || null,
              })),
          },
          confirmedMemberId,
          confirmedGuestId,
          skipDeduplication,
          selectedBreakoutId || null,
          walkIn ? { occurrenceId: walkIn.occurrenceId } : undefined
        )
      : await createRegistrant(
          eventId!,
          registrantPayload,
          confirmedMemberId,
          confirmedGuestId,
          skipDeduplication,
          selectedBreakoutId || null,
          walkIn ? { occurrenceId: walkIn.occurrenceId } : undefined
        )
    setSubmitting(false)

    if (result.success) {
      setAssignedBreakout(result.data.breakoutGroup)
      // Household members who are serving as volunteers aren't registered as
      // attendees — say so rather than letting them silently vanish.
      const skipped: string[] =
        "skippedVolunteers" in result.data && Array.isArray(result.data.skippedVolunteers)
          ? result.data.skippedVolunteers
          : []
      if (skipped.length > 0) {
        toast.info(
          `${skipped.join(", ")} ${skipped.length === 1 ? "is" : "are"} serving as a volunteer at this event and ${
            skipped.length === 1 ? "doesn't" : "don't"
          } need to register as an attendee.`
        )
      }
      setStep("done")
    } else {
      toast.error(result.error)
    }
  }

  if (step === "done" && clusterResults) {
    // Cluster shared form: partial success is normal — show each event's outcome
    // rather than a single all-or-nothing message.
    const matchedSource = confirmedMember ?? matchedMember
    const displayName =
      form.nickname.trim() || form.firstName.trim() || matchedSource?.firstName.trim() || ""
    const anyRegistered = clusterResults.some(
      (r) => r.status === "registered" || r.status === "already"
    )
    const statusLine = (r: ClusterEventRegistrationResult): string => {
      switch (r.status) {
        case "registered":
          return r.checkedIn ? "Registered · checked in" : "Registered"
        case "already":
          return r.checkedIn ? "Already registered · checked in" : "Already registered"
        case "closed":
          return "Registration for this event is closed"
        case "volunteer":
          return "You're serving as a volunteer — already included"
        case "failed":
          return "Couldn't register — please ask the team for help"
      }
    }
    const ok = (r: ClusterEventRegistrationResult) =>
      r.status === "registered" || r.status === "already" || r.status === "volunteer"
    return (
      <FormShell plain={plain}>
        <CardContent className="flex flex-col items-center gap-5 pt-10 pb-6">
          <div
            className={cn(
              "flex size-16 items-center justify-center rounded-full",
              anyRegistered ? "bg-green-100" : "bg-muted"
            )}
          >
            <IconCheck
              className={cn("size-8", anyRegistered ? "text-green-600" : "text-muted-foreground")}
            />
          </div>
          <div className="w-full text-center space-y-1.5">
            <p className="text-xl font-semibold">
              {anyRegistered
                ? `You're all set${displayName ? `, ${displayName}` : ""}!`
                : "Here's where things stand"}
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {/* A configured message replaces the stock line, but only when
                  something actually registered — the failure copy has to stay
                  accurate regardless of what the admin wrote. */}
              {anyRegistered
                ? (successMessage?.trim() ||
                  "We're so glad you're coming — here's how each event went.")
                : "None of the selected events could take your registration."}
            </p>
            <div className="mt-3 space-y-2 text-left">
              {clusterResults.map((r) => (
                <div key={r.eventId} className="rounded-xl border bg-muted/40 px-4 py-3 space-y-0.5">
                  <p className="text-sm font-semibold">{r.eventName}</p>
                  <p
                    className={cn(
                      "text-xs",
                      ok(r) ? "text-muted-foreground" : "text-destructive"
                    )}
                  >
                    {statusLine(r)}
                  </p>
                  {r.breakoutGroup && (
                    <p className="text-xs text-muted-foreground">
                      Breakout group: {r.breakoutGroup.name}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
          {walkIn ? (
            <Button className="w-full" asChild>
              <Link href={walkIn.backHref}>Back to check-in</Link>
            </Button>
          ) : (
            <Button className="w-full" onClick={handleReset}>
              Register another person
            </Button>
          )}
        </CardContent>
      </FormShell>
    )
  }

  if (step === "done") {
    // A confirmed member/guest keeps their own name — the form fields stay blank
    // when the person was matched by mobile rather than typed in.
    const matchedSource = confirmedMember ?? matchedMember
    const displayName =
      form.nickname.trim() || form.firstName.trim() || matchedSource?.firstName.trim() || ""
    const displayBreakout: AssignedBreakout | null =
      assignedBreakout ??
      (selectedBreakoutId
        ? (() => {
            const candidate = breakoutCandidates.find((c) => c.id === selectedBreakoutId)
            return candidate
              ? { id: candidate.id, name: candidate.name, meetingFormat: null, locationCity: null, schedule: null }
              : null
          })()
        : null)
    const meta = displayBreakout
      ? [
          displayBreakout.schedule
            ? // The meeting time is optional — fall back to the day alone.
              [
                DAY_NAMES[displayBreakout.schedule.dayOfWeek],
                displayBreakout.schedule.timeStart
                  ? formatTime(displayBreakout.schedule.timeStart)
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")
            : null,
          displayBreakout.meetingFormat
            ? MEETING_FORMAT_LABEL[displayBreakout.meetingFormat]
            : null,
          displayBreakout.locationCity,
        ].filter(Boolean)
      : []
    return (
      <FormShell plain={plain}>
        <CardContent className="flex flex-col items-center gap-5 pt-10 pb-6">
          <div className="flex size-16 items-center justify-center rounded-full bg-green-100">
            <IconCheck className="size-8 text-green-600" />
          </div>
          <div className="text-center space-y-1.5">
            <p className="text-xl font-semibold">
              Welcome{displayName ? `, ${displayName}` : ""}!
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {resolveSuccessMessage(successMessage, walkIn ? "WalkIn" : "Register", eventName)}
            </p>
            {displayBreakout && (
              <div className="mt-3 rounded-xl border bg-muted/40 px-4 py-3 text-left space-y-0.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Your breakout group
                </p>
                <p className="text-sm font-semibold">{displayBreakout.name}</p>
                {meta.length > 0 && (
                  <p className="text-xs text-muted-foreground">{meta.join(" · ")}</p>
                )}
              </div>
            )}
          </div>
          {walkIn ? (
            <Button className="w-full" asChild>
              <Link href={walkIn.backHref}>Back to check-in</Link>
            </Button>
          ) : (
            <Button className="w-full" onClick={handleReset}>
              Register another person
            </Button>
          )}
        </CardContent>
      </FormShell>
    )
  }

  if (step === "volunteer-blocked" && matchedMember) {
    const firstName = matchedMember.firstName
    return (
      <FormShell plain={plain}>
        <CardContent className="flex flex-col items-center gap-5 pt-10 pb-6">
          <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
            <IconCheck className="size-8 text-primary" />
          </div>
          <div className="text-center space-y-1.5">
            <p className="text-xl font-semibold">
              You&apos;re already on the list{firstName ? `, ${firstName}` : ""}!
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              You&apos;re serving as a volunteer at this event — you&apos;re already included and don&apos;t need to register as an attendee.
            </p>
          </div>
          {walkIn ? (
            <Button className="w-full" variant="outline" asChild>
              <Link href={walkIn.backHref}>Back to check-in</Link>
            </Button>
          ) : (
            <Button className="w-full" variant="outline" onClick={handleReset}>
              Register another person
            </Button>
          )}
        </CardContent>
      </FormShell>
    )
  }

  if (step === "disambiguate" && candidates) {
    return (
      <FormShell plain={plain}>
        <CardHeader>
          <CardTitle>Multiple profiles found</CardTitle>
          <CardDescription>
            {candidates.matchedBy === "mobile"
              ? "We found multiple profiles with this mobile number."
              : "We found multiple profiles with this email address."}{" "}
            Select the one that&apos;s you, or choose &quot;That&apos;s not me&quot;.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {candidates.items.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setMatchedMember({ ...c, matchedBy: candidates.matchedBy })
                setStep("confirm")
              }}
              className="w-full rounded-lg border p-4 text-left text-sm transition-colors hover:bg-muted/50"
            >
              <p className="font-medium">
                {c.firstName} {c.lastName}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({c.recordType})
                </span>
              </p>
              {c.email && <p className="text-muted-foreground">{c.email}</p>}
              {c.phone && <p className="text-muted-foreground">{c.phone}</p>}
            </button>
          ))}
          <Button
            variant="outline"
            className="w-full"
            onClick={() => register(null)}
            disabled={submitting}
          >
            {submitting ? "Registering…" : "That's not me"}
          </Button>
        </CardContent>
      </FormShell>
    )
  }

  if (step === "confirm" && matchedMember) {
    return (
      <FormShell plain={plain}>
        <CardHeader>
          <CardTitle>Is this you?</CardTitle>
          <CardDescription>
            {matchedMember.matchedBy === "mobile" &&
              "We found an existing record matching your mobile number."}
            {matchedMember.matchedBy === "email" &&
              "We found an existing record matching your email address."}
            {matchedMember.matchedBy === "nameBirthday" &&
              "We found an existing record matching your name and birthday."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border p-4 text-sm space-y-1">
            <p className="font-medium">
              {matchedMember.firstName} {matchedMember.lastName}
            </p>
            {matchedMember.email && (
              <p className="text-muted-foreground">{matchedMember.email}</p>
            )}
            {matchedMember.phone && (
              <p className="text-muted-foreground">{matchedMember.phone}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => {
                if (matchedMember.isVolunteer) {
                  setStep("volunteer-blocked")
                  return
                }
                if (matchedMember.recordType === "guest") {
                  register(null, matchedMember.id)
                } else {
                  register(matchedMember.id)
                }
              }}
              disabled={submitting}
            >
              {submitting ? "Registering…" : "Yes, that's me"}
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() =>
                matchedMember.recordType === "guest"
                  ? register(null, null, true)
                  : register(null)
              }
              disabled={submitting}
            >
              {submitting ? "Registering…" : "That's not me"}
            </Button>
          </div>
        </CardContent>
      </FormShell>
    )
  }

  if (step === "early-confirm" && matchedMember) {
    return (
      <FormShell plain={plain}>
        <CardHeader>
          <CardTitle>Is this you?</CardTitle>
          <CardDescription>
            {matchedMember.matchedBy === "mobile" &&
              "We found an existing record matching your mobile number."}
            {matchedMember.matchedBy === "email" &&
              "We found an existing record matching your email address."}
            {matchedMember.matchedBy === "nameBirthday" &&
              "We found an existing record matching your name and birthday."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border p-4 text-sm space-y-1">
            <p className="font-medium">
              {matchedMember.firstName} {matchedMember.lastName}
            </p>
            {matchedMember.email && (
              <p className="text-muted-foreground">{matchedMember.email}</p>
            )}
            {matchedMember.phone && (
              <p className="text-muted-foreground">{matchedMember.phone}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => handleEarlyConfirm(matchedMember)}
              disabled={submitting}
            >
              {submitting ? "Please wait…" : "Yes, that's me"}
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleEarlyReject}
              disabled={submitting}
            >
              That&apos;s not me
            </Button>
          </div>
        </CardContent>
      </FormShell>
    )
  }

  if (step === "early-disambiguate" && candidates) {
    return (
      <FormShell plain={plain}>
        <CardHeader>
          <CardTitle>Multiple profiles found</CardTitle>
          <CardDescription>
            {candidates.matchedBy === "mobile"
              ? "We found multiple profiles with this mobile number."
              : "We found multiple profiles with this email address."}{" "}
            Select the one that&apos;s you, or choose &quot;That&apos;s not me&quot;.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {candidates.items.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => handleEarlyConfirm({ ...c, matchedBy: candidates.matchedBy })}
              className="w-full rounded-lg border p-4 text-left text-sm transition-colors hover:bg-muted/50"
            >
              <p className="font-medium">
                {c.firstName} {c.lastName}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({c.recordType})
                </span>
              </p>
              {c.email && <p className="text-muted-foreground">{c.email}</p>}
              {c.phone && <p className="text-muted-foreground">{c.phone}</p>}
            </button>
          ))}
          <Button
            variant="outline"
            className="w-full"
            onClick={handleEarlyReject}
            disabled={submitting}
          >
            That&apos;s not me
          </Button>
        </CardContent>
      </FormShell>
    )
  }

  return (
    <FormShell plain={plain} ref={cardRef} className={cn(isMultiStep && "pt-0")}>
      {isMultiStep ? (
        <div className="px-6 pt-4 pb-1">
          {/* Step dots */}
          <div className="flex items-center gap-1.5 mb-4">
            {sections.map((s, i) => {
              const n = i + 1
              const done = n < safeStep
              const current = n === safeStep
              return (
                <React.Fragment key={s.key}>
                  <div
                    className={cn(
                      "rounded-full shrink-0 transition-all duration-150",
                      done
                        ? "size-2 bg-primary/50"
                        : current
                          ? "size-2.5 bg-primary"
                          : "size-2 bg-muted-foreground/25"
                    )}
                  />
                  {i < sections.length - 1 && (
                    <div
                      className={cn(
                        "flex-1 h-px transition-colors",
                        done ? "bg-primary/40" : "bg-border"
                      )}
                    />
                  )}
                </React.Fragment>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Step {safeStep} of {sections.length}
          </p>
          <p className="text-lg font-semibold mt-0.5">{sections[safeStep - 1].title}</p>
        </div>
      ) : (
        <CardHeader>
          <CardTitle>Register</CardTitle>
          <CardDescription>Fill in your details to register for this event.</CardDescription>
        </CardHeader>
      )}

      <CardContent className={cn(isMultiStep && "pt-4")}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* ── Personal Information ── */}
          {(!isMultiStep || currentSectionKey === "personal") && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="firstName">
                    First Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="firstName"
                    value={form.firstName}
                    onChange={(e) => set("firstName", e.target.value)}
                    placeholder="Juan"
                    required={!isMultiStep}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">
                    Last Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="lastName"
                    value={form.lastName}
                    onChange={(e) => set("lastName", e.target.value)}
                    placeholder="dela Cruz"
                    required={!isMultiStep}
                  />
                </div>
              </div>

              {cfg.fieldNickname && (
                <div className="space-y-2">
                  <Label htmlFor="nickname">
                    Nickname <RequiredMark on={cfg.fieldNicknameRequired} />
                  </Label>
                  <Input
                    id="nickname"
                    value={form.nickname}
                    onChange={(e) => set("nickname", e.target.value)}
                    placeholder="Jun"
                  />
                </div>
              )}

              {cfg.fieldMobile && (
                <div className="space-y-2">
                  <Label htmlFor="mobileNumber">
                    Mobile Number <RequiredMark on={cfg.fieldMobileRequired} />
                  </Label>
                  <OptionalPhonePHInput
                    id="mobileNumber"
                    value={form.mobileNumber}
                    onChange={(v) => set("mobileNumber", v)}
                    noNumber={noMobile}
                    onNoNumberChange={setNoMobile}
                    hideOptOut={cfg.fieldMobileRequired}
                  />
                </div>
              )}

              {cfg.fieldEmail && (
                <div className="space-y-2">
                  <Label htmlFor="email">
                    Email <RequiredMark on={cfg.fieldEmailRequired} />
                  </Label>
                  <OptionalEmailInput
                    id="email"
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    placeholder="juan@email.com"
                    noEmail={noEmail}
                    onNoEmailChange={setNoEmail}
                    hideOptOut={cfg.fieldEmailRequired}
                  />
                </div>
              )}

              {/* Life Stage sits with the other demographics rather than in the
                  DGroup step: it describes the person, and ministries are scoped by
                  it, so it's worth asking whether or not they want a group. */}
              {cfg.fieldLifeStage && lifeStages.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="lifeStage">
                    Life Stage <RequiredMark on={cfg.fieldLifeStageRequired} />
                  </Label>
                  <Select
                    value={form.lifeStageId}
                    onValueChange={(v) => set("lifeStageId", v)}
                  >
                    <SelectTrigger id="lifeStage">
                      <SelectValue placeholder="Select life stage" />
                    </SelectTrigger>
                    <SelectContent>
                      {/* No opt-out item (CCF-143). Unanswered is the placeholder
                          state, which stores null exactly as the old sentinel did. */}
                      {lifeStages.map((ls) => (
                        <SelectItem key={ls.id} value={ls.id}>
                          {ls.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {cfg.fieldBirthDate && (
                <BirthMonthYearInput
                  required={cfg.fieldBirthDateRequired}
                  month={form.birthMonth}
                  year={form.birthYear}
                  onMonthChange={(v) => set("birthMonth", v)}
                  onYearChange={(v) => set("birthYear", v)}
                />
              )}

              {cfg.fieldAgeRange && ageRanges.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="ageRange">
                    Age Range <RequiredMark on={cfg.fieldAgeRangeRequired} />
                  </Label>
                  <Select
                    value={form.ageRangeBucketId}
                    onValueChange={(v) => set("ageRangeBucketId", v)}
                  >
                    <SelectTrigger id="ageRange">
                      <SelectValue placeholder="Select age range" />
                    </SelectTrigger>
                    <SelectContent>
                      {/* No opt-out item — see the Life Stage select above. */}
                      {ageRanges.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {cfg.fieldGender && (
                <div className="space-y-2">
                  <Label>
                    Gender <RequiredMark on={cfg.fieldGenderRequired} />
                  </Label>
                  <div className="flex gap-3">
                    {["Male", "Female"].map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => set("gender", form.gender === g ? "" : g)}
                        className={`flex-1 rounded-lg border py-2.5 text-sm font-medium transition-colors ${
                          form.gender === g
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background hover:bg-muted"
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Events (cluster shared form, CCF-132) ── */}
          {cluster && (!isMultiStep || currentSectionKey === "events") && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Tick the events you&apos;ll be joining — at least one.
              </p>
              {cluster.events.map((ev) => {
                const checked = selectedEventIds.includes(ev.id)
                return (
                  <label
                    key={ev.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/50",
                      checked && "border-primary bg-primary/5"
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleSelectedEvent(ev.id)}
                      className="mt-0.5"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{ev.name}</span>
                      {ev.meta && (
                        <span className="block text-xs text-muted-foreground">{ev.meta}</span>
                      )}
                    </span>
                  </label>
                )
              })}
            </div>
          )}

          {/* ── Small Group Info ── */}
          {includeSmallGroup && (!isMultiStep || currentSectionKey === "smallgroup") && (
            <>
              {!isMultiStep && (
                <div className="pt-2 border-t">
                  <p className="text-sm font-medium text-foreground">DGroup</p>
                </div>
              )}

              {confirmedMember?.recordType === "member" && !confirmedMember.smallGroupId && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground">
                  You&apos;re not in a DGroup yet — joining one is a great next step!
                </div>
              )}

              {/* For confirmed members: single "Join a Small Group" toggle */}
              {confirmedMember?.recordType === "member" ? (
                <div className={cn("flex items-start gap-2", !isMultiStep && "pt-1")}>
                  <Checkbox
                    id="wantsSmallGroup"
                    checked={smallGroupIntent === "wants"}
                    onCheckedChange={(v) => setSmallGroupIntent(v === true ? "wants" : null)}
                    className="mt-0.5"
                  />
                  <Label htmlFor="wantsSmallGroup" className="text-sm font-normal leading-snug">
                    Join a DGroup
                  </Label>
                </div>
              ) : (
                /* For guests / unconfirmed: two mutually exclusive options */
                <div className={cn("space-y-2", !isMultiStep && "pt-1")}>
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="wantsSmallGroup"
                      checked={smallGroupIntent === "wants"}
                      onCheckedChange={(v) => setSmallGroupIntent(v === true ? "wants" : null)}
                      className="mt-0.5"
                    />
                    <Label htmlFor="wantsSmallGroup" className="text-sm font-normal leading-snug">
                      I want to join a DGroup
                    </Label>
                  </div>
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="alreadyInSmallGroup"
                      checked={smallGroupIntent === "already_in"}
                      onCheckedChange={(v) => {
                        setSmallGroupIntent(v === true ? "already_in" : null)
                        if (!v) {
                          setClaimedSmallGroupId("")
                          setClaimedGroupQuery("")
                          setClaimedGroupResults([])
                          setClaimedElsewhere(false)
                          setClaimedSatellite("")
                        }
                      }}
                      className="mt-0.5"
                    />
                    <Label htmlFor="alreadyInSmallGroup" className="text-sm font-normal leading-snug">
                      I&apos;m already part of a DGroup
                    </Label>
                  </div>
                </div>
              )}

              {/* Already in a group — leader/group search */}
              {smallGroupIntent === "already_in" && (
                <div className="space-y-3">
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="claimedElsewhere"
                      checked={claimedElsewhere}
                      onCheckedChange={(v) => {
                        const on = v === true
                        setClaimedElsewhere(on)
                        // Only one answer survives — drop whichever the person left behind.
                        if (on) {
                          setClaimedSmallGroupId("")
                          setClaimedGroupQuery("")
                          setClaimedGroupResults([])
                        } else {
                          setClaimedSatellite("")
                        }
                      }}
                      className="mt-0.5"
                    />
                    <Label htmlFor="claimedElsewhere" className="text-sm font-normal leading-snug">
                      My DGroup is at another CCF satellite
                    </Label>
                  </div>

                  {claimedElsewhere && (
                    <div className="space-y-1.5">
                      <Label htmlFor="claimedSatellite">Which satellite?</Label>
                      <PersonCombobox
                        id="claimedSatellite"
                        options={satelliteOptions}
                        value={claimedSatellite}
                        onValueChange={setClaimedSatellite}
                        placeholder="Select a CCF satellite"
                        searchPlaceholder="Search satellites…"
                        emptyText="No satellite found."
                      />
                    </div>
                  )}
                </div>
              )}

              {smallGroupIntent === "already_in" && !claimedElsewhere && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="claimedGroupSearch">Search by leader&apos;s name</Label>
                    <Input
                      id="claimedGroupSearch"
                      value={claimedGroupQuery}
                      onChange={(e) => handleClaimedGroupQueryChange(e.target.value)}
                      placeholder="e.g. Juan dela Cruz"
                      autoComplete="off"
                    />
                  </div>
                  {claimedGroupSearching && (
                    <p className="text-xs text-muted-foreground">Searching…</p>
                  )}
                  {!claimedGroupSearching && claimedGroupResults.length > 0 && (
                    <div className="space-y-1.5">
                      {claimedGroupResults.map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => {
                            setClaimedSmallGroupId(g.id)
                            setClaimedGroupQuery(g.name)
                            setClaimedGroupResults([])
                          }}
                          className={cn(
                            "w-full rounded-lg border px-4 py-3 text-left transition-colors",
                            claimedSmallGroupId === g.id
                              ? "border-primary bg-primary/5"
                              : "bg-background hover:bg-muted"
                          )}
                        >
                          <p className="text-sm font-medium">{g.name}</p>
                          <p className="text-xs text-muted-foreground">Led by {g.leaderName}</p>
                        </button>
                      ))}
                    </div>
                  )}
                  {!claimedGroupSearching && claimedGroupQuery.trim().length >= 2 && claimedGroupResults.length === 0 && !claimedSmallGroupId && (
                    <p className="text-xs text-muted-foreground">
                      No groups found for &ldquo;{claimedGroupQuery}&rdquo;.
                    </p>
                  )}
                  {claimedSmallGroupId && claimedGroupResults.length === 0 && (
                    <div className="flex items-center justify-between rounded-lg border border-primary bg-primary/5 px-4 py-3">
                      <div>
                        <p className="text-sm font-medium">{claimedGroupQuery}</p>
                        <p className="text-xs text-muted-foreground">DGroup selected</p>
                      </div>
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setClaimedSmallGroupId("")
                          setClaimedGroupQuery("")
                        }}
                      >
                        Change
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Wants to join — matching preferences */}
              {smallGroupIntent === "wants" && (
                <>
                  <div className={cn(isMultiStep ? "pt-1" : "pt-2 border-t")}>
                    <p className="text-sm font-medium text-foreground">Help us connect you</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      These optional details help us find the right Breakout Group for you.
                    </p>
                  </div>

                  {cfg.fieldLanguage && (
                    <div className="space-y-2">
                      <Label>
                        Primary Language <RequiredMark on={cfg.fieldLanguageRequired} />
                      </Label>
                      <MultiSelect
                        options={LANGUAGE_OPTIONS}
                        value={form.language}
                        onChange={(v) => setForm((prev) => ({ ...prev, language: v }))}
                        placeholder="Select language(s)"
                      />
                    </div>
                  )}

                  {cfg.fieldMeetingPreference && (
                    <div className="space-y-2">
                      <Label>
                        Meeting Preference <RequiredMark on={cfg.fieldMeetingPreferenceRequired} />
                      </Label>
                      <Select
                        value={form.meetingPreference}
                        onValueChange={(v) => set("meetingPreference", v === "none" ? "" : v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select preference" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No preference</SelectItem>
                          <SelectItem value="Online">Online</SelectItem>
                          <SelectItem value="Hybrid">Hybrid</SelectItem>
                          <SelectItem value="InPerson">In Person</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {cfg.fieldSchedule && (
                    <div className="space-y-2">
                      <Label>
                        Best time to meet <RequiredMark on={cfg.fieldScheduleRequired} />
                      </Label>
                      <ScheduleInput
                        allowAny
                        dayOfWeek={form.scheduleDayOfWeek}
                        timeStart={form.scheduleTimeStart}
                        timeEnd={form.scheduleTimeEnd}
                        onDayChange={(v) => set("scheduleDayOfWeek", v)}
                        onTimeStartChange={(v) => set("scheduleTimeStart", v)}
                        onTimeEndChange={(v) => set("scheduleTimeEnd", v)}
                      />
                    </div>
                  )}

                  {cfg.fieldWorkCity && (
                    <div className="space-y-2">
                      <Label>
                        Work / Home City <RequiredMark on={cfg.fieldWorkCityRequired} />
                      </Label>
                      <Select
                        value={form.workCity || "_none"}
                        onValueChange={(v) => set("workCity", v === "_none" ? "" : v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select city" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">No preference</SelectItem>
                          {CITY_OPTIONS.map((city) => (
                            <SelectItem key={city} value={city}>
                              {city}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ── Breakout Group ── */}
          {showBreakoutSection && (!isMultiStep || currentSectionKey === "breakout") && (
            <>
              {!isMultiStep && (
                <div className="pt-2 border-t">
                  <p className="text-sm font-medium text-foreground">Breakout Group</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Pick a group for the event — optional.
                  </p>
                </div>
              )}

              {isMultiStep && (
                <p className="text-sm text-muted-foreground">
                  Pick a group for the event — optional.
                </p>
              )}

              {!hasBreakoutChoices && breakoutNotice && (
                <div className="rounded-lg border border-dashed bg-muted/40 p-4">
                  <p className="text-sm font-medium">
                    {BREAKOUT_NOTICE_COPY[breakoutNotice].title}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {BREAKOUT_NOTICE_COPY[breakoutNotice].body}
                  </p>
                </div>
              )}

              {suggestedBreakout && (() => {
                const isSelected = selectedBreakoutId === suggestedBreakout.id
                return (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isSelected}
                    aria-label={`Suggested group: ${suggestedBreakout.name}`}
                    onClick={() =>
                      setSelectedBreakoutId(isSelected ? "" : suggestedBreakout.id)
                    }
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-colors cursor-pointer",
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border bg-background hover:bg-muted/50"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Suggested for you
                      </p>
                      <p className="mt-1 text-sm font-medium truncate">{suggestedBreakout.name}</p>
                      {suggestedOccupancy && (
                        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                          {suggestedOccupancy.label} members
                          {suggestedOccupancy.remaining !== null &&
                            ` · ${suggestedOccupancy.remaining} left`}
                        </p>
                      )}
                    </div>
                    <div
                      aria-hidden="true"
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/30 bg-background"
                      )}
                    >
                      {isSelected && <IconCheck className="size-3.5" />}
                    </div>
                  </button>
                )
              })()}

              <div className={cn("space-y-2", !hasBreakoutChoices && "hidden")}>
                <Label>Or browse all groups</Label>
                <Select
                  value={selectedBreakoutId || "_none"}
                  onValueChange={(v) => setSelectedBreakoutId(v === "_none" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a group" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">No selection</SelectItem>
                    {browsableCandidates.map((g) => (
                      // A full group is unselectable on the public form but
                      // selectable at the door: a staff member placing someone
                      // may have a reason to go over, a self-serve registrant
                      // does not.
                      <SelectItem key={g.id} value={g.id} disabled={!g.occupancyView && g.isFull}>
                        <span className="flex w-full items-center justify-between gap-3">
                          <span className="truncate">{g.name}</span>
                          {g.occupancyView ? (
                            <span
                              className={cn(
                                "shrink-0 text-xs tabular-nums",
                                g.occupancyView.isFull
                                  ? "text-destructive"
                                  : "text-muted-foreground"
                              )}
                            >
                              {g.occupancyView.label}
                              {g.occupancyView.isFull && " · full"}
                            </span>
                          ) : (
                            g.isFull && (
                              <span className="shrink-0 text-xs text-muted-foreground">(full)</span>
                            )
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* The warning half of "selectable with a warning". A SelectItem
                    can't host this, so it sits under the trigger and speaks to
                    whatever is currently chosen. */}
                {selectedOccupancy?.isFull && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                    <p className="text-sm font-medium">This group is already at capacity</p>
                    <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                      {selectedOccupancy.label} members. You can still place them here — the group
                      will go over its limit.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Household ── */}
          {cfg.sectionFamily && (!isMultiStep || currentSectionKey === "household") && (
            <>
              {!isMultiStep && (
                <div className="pt-2 border-t">
                  <p className="text-sm font-medium text-foreground">Your Household</p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {cfg.familySpouseOnly
                  ? "Optional — tell us about your spouse so we can keep you together."
                  : "Register the rest of your household here so you can all be checked in together. Only your own contact details are needed."}
              </p>

              <div className="space-y-2">
                <Label htmlFor="primaryRole">Your role at home</Label>
                <Select
                  value={primaryRole}
                  onValueChange={(v) => setPrimaryRole(v as FamilyRoleValue)}
                >
                  <SelectTrigger id="primaryRole">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(cfg.familySpouseOnly
                      ? (["FatherHusband", "MotherWife"] as const)
                      : FAMILY_ROLES
                    ).map((role) => (
                      <SelectItem key={role} value={role}>
                        {FAMILY_ROLE_LABELS[role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {cfg.familySpouseOnly ? (
                <div className="space-y-3 rounded-lg border p-3">
                  <p className="text-sm font-medium">
                    Your spouse{" "}
                    <span className="font-normal text-muted-foreground">
                      ({FAMILY_ROLE_LABELS[spouseRole]}) — optional
                    </span>
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="spouse-first">First Name</Label>
                      <Input
                        id="spouse-first"
                        value={spouse.firstName}
                        onChange={(e) => setSpouseField("firstName", e.target.value)}
                        placeholder="Maria"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="spouse-last">Last Name</Label>
                      <Input
                        id="spouse-last"
                        value={spouse.lastName}
                        onChange={(e) => setSpouseField("lastName", e.target.value)}
                        placeholder="dela Cruz"
                      />
                    </div>
                  </div>

                  {cfg.fieldBirthDate && (
                    <BirthMonthYearInput
                      month={spouse.birthMonth}
                      year={spouse.birthYear}
                      onMonthChange={(v) => setSpouseField("birthMonth", v)}
                      onYearChange={(v) => setSpouseField("birthYear", v)}
                    />
                  )}

                  {cfg.fieldGender && (
                    <div className="space-y-2">
                      <Label>Gender</Label>
                      <div className="flex gap-3">
                        {["Male", "Female"].map((g) => (
                          <button
                            key={g}
                            type="button"
                            onClick={() =>
                              setSpouseField("gender", spouse.gender === g ? "" : g)
                            }
                            className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                              spouse.gender === g
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-background hover:bg-muted"
                            }`}
                          >
                            {g}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
              householdMembers.map((member, index) => (
                <div key={index} className="space-y-3 rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Household member {index + 1}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setHouseholdMembers((prev) => prev.filter((_, i) => i !== index))
                      }
                    >
                      Remove
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor={`hm-first-${index}`}>
                        First Name <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id={`hm-first-${index}`}
                        value={member.firstName}
                        onChange={(e) =>
                          setHouseholdMembers((prev) =>
                            prev.map((m, i) =>
                              i === index ? { ...m, firstName: e.target.value } : m
                            )
                          )
                        }
                        placeholder="Juan"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`hm-last-${index}`}>
                        Last Name <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id={`hm-last-${index}`}
                        value={member.lastName}
                        onChange={(e) =>
                          setHouseholdMembers((prev) =>
                            prev.map((m, i) =>
                              i === index ? { ...m, lastName: e.target.value } : m
                            )
                          )
                        }
                        placeholder="dela Cruz"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`hm-role-${index}`}>Relationship</Label>
                    <Select
                      value={member.role}
                      onValueChange={(v) =>
                        setHouseholdMembers((prev) =>
                          prev.map((m, i) =>
                            i === index ? { ...m, role: v as FamilyRoleValue } : m
                          )
                        )
                      }
                    >
                      <SelectTrigger id={`hm-role-${index}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FAMILY_ROLES.map((role) => (
                          <SelectItem key={role} value={role}>
                            {FAMILY_ROLE_LABELS[role]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {cfg.fieldBirthDate && (
                    <BirthMonthYearInput
                      month={member.birthMonth}
                      year={member.birthYear}
                      onMonthChange={(v) =>
                        setHouseholdMembers((prev) =>
                          prev.map((m, i) => (i === index ? { ...m, birthMonth: v } : m))
                        )
                      }
                      onYearChange={(v) =>
                        setHouseholdMembers((prev) =>
                          prev.map((m, i) => (i === index ? { ...m, birthYear: v } : m))
                        )
                      }
                    />
                  )}

                  {cfg.fieldAgeRange && ageRanges.length > 0 && (
                    <div className="space-y-2">
                      <Label htmlFor={`hm-age-${index}`}>
                        Age Range <RequiredMark on={cfg.fieldAgeRangeRequired} />
                      </Label>
                      <Select
                        value={member.ageRangeBucketId}
                        onValueChange={(v) =>
                          setHouseholdMembers((prev) =>
                            prev.map((m, i) =>
                              i === index ? { ...m, ageRangeBucketId: v } : m
                            )
                          )
                        }
                      >
                        <SelectTrigger id={`hm-age-${index}`}>
                          <SelectValue placeholder="Select age range" />
                        </SelectTrigger>
                        <SelectContent>
                          {/* No opt-out item — see the Life Stage select above. */}
                          {ageRanges.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {cfg.fieldGender && (
                    <div className="space-y-2">
                      <Label>Gender</Label>
                      <div className="flex gap-3">
                        {["Male", "Female"].map((g) => (
                          <button
                            key={g}
                            type="button"
                            onClick={() =>
                              setHouseholdMembers((prev) =>
                                prev.map((m, i) =>
                                  i === index ? { ...m, gender: m.gender === g ? "" : g } : m
                                )
                              )
                            }
                            className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                              member.gender === g
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-background hover:bg-muted"
                            }`}
                          >
                            {g}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )))}

              {!cfg.familySpouseOnly && householdMembers.length < MAX_HOUSEHOLD_MEMBERS && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() =>
                    setHouseholdMembers((prev) => [...prev, { ...defaultHouseholdMember }])
                  }
                >
                  Add household member
                </Button>
              )}
            </>
          )}

          {/* ── Dietary Preferences ── */}
          {includeDietary && (!isMultiStep || currentSectionKey === "dietary") && (
            <>
              {!isMultiStep && (
                <div className="pt-2 border-t">
                  <p className="text-sm font-medium text-foreground">Dietary restrictions</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Let us know if you have any dietary preferences.
                  </p>
                </div>
              )}

              {isMultiStep && (
                <p className="text-sm text-muted-foreground">
                  Let us know if you have any dietary preferences.
                </p>
              )}

              <div className="space-y-2">
                <Label>Preference</Label>
                <Select
                  value={form.dietaryPreference || "_none"}
                  onValueChange={(v) =>
                    setForm((prev) => ({
                      ...prev,
                      dietaryPreference: (v === "_none" ? "" : v) as DietaryValue,
                      dietaryOther: v === "Other" ? prev.dietaryOther : "",
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select preference" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">No restrictions</SelectItem>
                    {DIETARY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {form.dietaryPreference === "Other" && (
                <div className="space-y-2">
                  <Label htmlFor="dietaryOther">Please specify</Label>
                  <Input
                    id="dietaryOther"
                    value={form.dietaryOther}
                    onChange={(e) => set("dietaryOther", e.target.value)}
                    placeholder="e.g. Low-sodium"
                  />
                </div>
              )}
            </>
          )}

          {/* ── Payment ── */}
          {includePayment && (!isMultiStep || currentSectionKey === "payment") && (
            <>
              {!isMultiStep && (
                <div className="pt-2 border-t">
                  <p className="text-sm font-medium text-foreground">Payment</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Enter your payment reference (e.g. GCash transaction ID).
                  </p>
                </div>
              )}

              {isMultiStep && (
                <p className="text-sm text-muted-foreground">
                  Enter your payment reference (e.g. GCash transaction ID).
                </p>
              )}

              <div className="space-y-2">
                <Label htmlFor="paymentReference">Payment reference</Label>
                <Input
                  id="paymentReference"
                  value={form.paymentReference}
                  onChange={(e) => set("paymentReference", e.target.value)}
                  placeholder="Transaction or reference number"
                />
              </div>
            </>
          )}

          {/* ── Privacy Policy ── */}
          {(!isMultiStep || safeStep === sections.length) && (
            <PrivacyPolicyCheckbox
              checked={privacyAccepted}
              onCheckedChange={setPrivacyAccepted}
            />
          )}

          {/* ── Navigation ── */}
          {isMultiStep ? (
            <div className="flex gap-2 pt-2">
              {safeStep > 1 ? (
                <Button type="button" variant="outline" onClick={handleBack}>
                  Back
                </Button>
              ) : walkIn ? (
                <Button type="button" variant="outline" asChild>
                  <Link href={walkIn.backHref}>Back</Link>
                </Button>
              ) : null}
              {safeStep < sections.length ? (
                <Button type="button" className="flex-1" disabled={submitting} onClick={handleNext}>
                  {submitting ? "Please wait…" : "Next"}
                </Button>
              ) : (
                <Button type="button" className="flex-1" disabled={submitting} onClick={handleSubmit}>
                  {submitting ? "Checking…" : walkIn ? "Register & Check In" : "Register"}
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <Button type="button" className="w-full" disabled={submitting} onClick={handleSubmit}>
                {submitting ? "Checking…" : walkIn ? "Register & Check In" : "Register"}
              </Button>
              {walkIn && (
                <Button type="button" variant="ghost" className="w-full" asChild>
                  <Link href={walkIn.backHref}>Back</Link>
                </Button>
              )}
            </div>
          )}
        </form>
      </CardContent>
    </FormShell>
  )
}
