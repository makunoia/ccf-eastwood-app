"use client"

import * as React from "react"
import {
  IconAlertTriangle,
  IconCake,
  IconCalendarTime,
  IconCash,
  IconDeviceLaptop,
  IconDeviceMobile,
  IconFriends,
  IconHeart,
  IconLanguage,
  IconMail,
  IconMapPin,
  IconMessage2,
  IconNumbers,
  IconSalad,
  IconSignature,
  IconSitemap,
  IconStairs,
  IconUser,
  IconUsers,
  IconGenderBigender,
  type Icon,
} from "@tabler/icons-react"
import { toast } from "sonner"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  BARE_EVENT_FORM_CONFIG,
  FORM_CONTEXT_META,
  FORM_FIELD_META,
  FORM_OPTION_META,
  FORM_PERSISTED_KEYS,
  IDENTITY_FIELD_KEYS,
  SUCCESS_MESSAGE_MAX_LENGTH,
  defaultSuccessMessage,
  formLayoutFor,
  hasIdentityField,
  isRequirableSection,
  requiredKeyFor,
  type EventFormConfigData,
  type FormFieldKey,
  type FormLayoutSection,
  type FormPersistedKey,
  type FormToggleKey,
} from "@/lib/forms/context-config"
import {
  prerequisiteFor,
  type TogglePrerequisites,
} from "@/lib/forms/form-prerequisites"
import {
  copyClusterFormConfig,
  copyEventFormConfig,
  saveClusterFormSuccessMessage,
  saveEventFormSuccessMessage,
  setClusterFormToggle,
  setEventFormToggle,
} from "@/app/(dashboard)/events/form-config-actions"
import type { EventModuleType, FormContext } from "@/app/generated/prisma/client"

/**
 * Per-context registration form builder (CCF-120). Register / Walk-in / Check-in
 * each get their own tab and their own independent toggles.
 *
 * The builder is grouped **by section, in the form's own step order**, because a
 * flat list of sections beside a flat list of fields gave no indication of which
 * fields appear where — and most of them only render inside a particular step. The
 * grouping comes from `formLayoutFor()` so it stays pinned to the real form by
 * tests instead of being restated here.
 *
 * Icons live here rather than in the shared registry so nothing non-serializable
 * crosses the server/client boundary.
 */

const TOGGLE_ICONS: Record<FormToggleKey | "personal", Icon> = {
  personal: IconUser,
  sectionSmallGroup: IconUsers,
  sectionBreakout: IconSitemap,
  sectionDietary: IconSalad,
  sectionPayment: IconCash,
  sectionFamily: IconFriends,
  fieldNickname: IconSignature,
  fieldMobile: IconDeviceMobile,
  fieldEmail: IconMail,
  fieldLifeStage: IconStairs,
  fieldGender: IconGenderBigender,
  fieldBirthDate: IconCake,
  fieldAgeRange: IconNumbers,
  fieldWorkCity: IconMapPin,
  fieldLanguage: IconLanguage,
  fieldSchedule: IconCalendarTime,
  fieldMeetingPreference: IconDeviceLaptop,
  familySpouseOnly: IconHeart,
}

/**
 * Toggles that make no sense in a context. Check-in is an attendance surface — it
 * never takes payment and never lets someone re-pick their breakout group (it
 * shows the group they were already assigned), and its profile step has no birth
 * date, nickname, mobile or email input — it identifies someone who already
 * exists rather than collecting their details from scratch.
 */
const NOT_APPLICABLE: Partial<Record<FormContext, FormToggleKey[]>> = {
  CheckIn: [
    "sectionPayment",
    "sectionBreakout",
    "fieldBirthDate",
    "fieldNickname",
    "fieldMobile",
    "fieldEmail",
  ],
}

/** Default tab order when a caller doesn't narrow it. */
const CONTEXT_ORDER: FormContext[] = ["Register", "WalkIn", "CheckIn"]

/**
 * Width of the Required rail on a field row.
 *
 * Reserved on *every* row, not just the ones showing a switch: without it a row
 * whose field is unticked wrapped its description across the full width while its
 * neighbours wrapped short, and the ragged right edge read as text colliding with
 * the controls. One fixed column means every description wraps at the same
 * measure and the switches line up under their heading.
 */
const REQUIRED_COL = "w-20"


/**
 * Contexts that can copy their whole config from another, and where from.
 *
 * Only Walk-in, and only from Register: they render the same component with the
 * same props (a walk-in is `/events/[id]/register?checkin=…`), so a copy lands
 * exactly. Check-in is deliberately excluded — its form has a different shape, so
 * copying Register onto it would set toggles it can't honor.
 */
const COPY_SOURCE: Partial<Record<FormContext, FormContext>> = {
  WalkIn: "Register",
}

function sameConfig(a: EventFormConfigData, b: EventFormConfigData): boolean {
  // Required flags count: two contexts asking the same questions but insisting on
  // different answers are not in sync.
  return FORM_PERSISTED_KEYS.every((key) => a[key] === b[key])
}

export type EventFormConfigs = Record<FormContext, EventFormConfigData>

export function EventFormBuilder({
  eventId,
  clusterId,
  initial,
  /**
   * Which surfaces this instance configures. Register and Walk-in live on the
   * Registration form page (they drive the same component); Check-in is its own
   * form with its own page, so it passes just `["CheckIn"]`.
   */
  contexts = CONTEXT_ORDER,
  modules,
  heading = "Registration form",
  blurb = "Each surface is configured on its own, and listed in the order people see it. Name is always collected; everything else is opt-in, and anything you switch on can be made required.",
  notApplicable = [],
  prerequisites,
  successMessages,
  eventName,
}: {
  eventId?: string
  /** When set, the builder edits a cluster's shared form config instead of an event's (CCF-132). */
  clusterId?: string
  initial: EventFormConfigs
  contexts?: readonly FormContext[]
  /**
   * The event's enabled modules. Some steps aren't the admin's to choose here —
   * the payment step follows the Priced module and the breakout step follows the
   * Breakout module, so offering a toggle would be a second switch fighting the
   * first. Omitted by the cluster builder, which has no modules.
   */
  modules?: readonly EventModuleType[]
  heading?: string
  blurb?: string
  /** Extra toggles hidden in every context — e.g. the cluster form has no payment/breakout/household. */
  notApplicable?: readonly FormToggleKey[]
  /** Warnings for toggles that are on but can't render for lack of data elsewhere. */
  prerequisites?: TogglePrerequisites
  /**
   * Stored success-screen copy per context (CCF-130). Null for a context means
   * "unset" — the editor shows the default as placeholder rather than as text, so
   * an admin can tell configured copy from inherited copy.
   */
  successMessages?: Partial<Record<FormContext, string | null>>
  /** Used only to render the default copy accurately in the editor's placeholder. */
  eventName?: string
}) {
  const moduleDriven: FormToggleKey[] = modules
    ? [
        // Both are overlaid onto the stored config in `applyModuleGates`, so a
        // toggle here would show a control the read path ignores.
        "sectionPayment",
        ...(modules.includes("Breakout") ? [] : (["sectionBreakout"] as FormToggleKey[])),
      ]
    : []
  const suppressed: readonly FormToggleKey[] = [...notApplicable, ...moduleDriven]
  const [configs, setConfigs] = React.useState<EventFormConfigs>(initial)
  const [pending, setPending] = React.useState<string | null>(null)
  const [copying, setCopying] = React.useState<FormContext | null>(null)
  const [confirmCopy, setConfirmCopy] = React.useState<FormContext | null>(null)

  async function handleCopy(target: FormContext) {
    const source = COPY_SOURCE[target]
    if (!source) return
    setConfirmCopy(null)
    setCopying(target)
    const result = clusterId
      ? await copyClusterFormConfig(clusterId, source, target)
      : await copyEventFormConfig(eventId!, source, target)
    setCopying(null)
    if (result.success) {
      // The copy is exact, so mirroring local state avoids a refetch.
      setConfigs((prev) => ({ ...prev, [target]: { ...prev[source] } }))
      toast.success(
        `${FORM_CONTEXT_META[target].label} now matches ${FORM_CONTEXT_META[source].label}`
      )
    } else {
      toast.error(result.error)
    }
  }

  async function handleToggle(context: FormContext, key: FormPersistedKey) {
    const next = !configs[context][key]
    setPending(`${context}:${key}`)
    // Optimistic — reverted below if the write fails.
    setConfigs((prev) => ({
      ...prev,
      [context]: { ...prev[context], [key]: next },
    }))
    const result = clusterId
      ? await setClusterFormToggle(clusterId, context, key, next)
      : await setEventFormToggle(eventId!, context, key, next)
    setPending(null)
    if (!result.success) {
      setConfigs((prev) => ({
        ...prev,
        [context]: { ...prev[context], [key]: !next },
      }))
      toast.error(result.error)
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h3 className="type-label text-muted-foreground">{heading}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{blurb}</p>
      </div>

      <Tabs defaultValue={contexts[0]} className="max-w-2xl">
        {/* A single surface needs no tab strip — the page title already names it. */}
        {contexts.length > 1 && (
          <TabsList>
            {contexts.map((context) => (
              <TabsTrigger key={context} value={context}>
                {FORM_CONTEXT_META[context].label}
              </TabsTrigger>
            ))}
          </TabsList>
        )}

        {contexts.map((context) => (
          <TabsContent key={context} value={context} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {FORM_CONTEXT_META[context].description}
            </p>

            <CopyFromSource
              context={context}
              configs={configs}
              copying={copying === context}
              onRequest={() => {
                const source = COPY_SOURCE[context]
                if (!source) return
                // Nothing to lose when the target is still bare — skip the prompt.
                if (sameConfig(configs[context], BARE_EVENT_FORM_CONFIG)) {
                  void handleCopy(context)
                } else {
                  setConfirmCopy(context)
                }
              }}
            />

            <Accordion type="multiple" className="rounded-lg border">
              {formLayoutFor(context).map((section) => (
                <SectionItem
                  key={section.key}
                  section={section}
                  context={context}
                  config={configs[context]}
                  pending={pending}
                  onToggle={handleToggle}
                  notApplicable={suppressed}
                  prerequisites={prerequisites}
                />
              ))}
            </Accordion>

            {/* Check-in has no success screen — it confirms attendance in place. */}
            {context !== "CheckIn" && (
              <SuccessMessageEditor
                context={context}
                eventId={eventId}
                clusterId={clusterId}
                eventName={eventName}
                initial={successMessages?.[context] ?? null}
              />
            )}
          </TabsContent>
        ))}
      </Tabs>

      <AlertDialog
        open={confirmCopy !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmCopy(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Replace {confirmCopy && FORM_CONTEXT_META[confirmCopy].label} with{" "}
              {confirmCopy && COPY_SOURCE[confirmCopy] && FORM_CONTEXT_META[COPY_SOURCE[confirmCopy]!].label}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Every section and field currently set here will be overwritten. This can&apos;t be
              undone, but you can keep editing afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmCopy && handleCopy(confirmCopy)}>
              Replace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

/**
 * "Match Register" for a context that can inherit another's config. A one-shot
 * copy rather than a live binding: an admin almost always wants Register's shape
 * as a starting point and then a tweak or two (walk-ins usually skip payment), and
 * a persistent mirror would silently rewrite this tab whenever Register changed.
 */
function CopyFromSource({
  context,
  configs,
  copying,
  onRequest,
}: {
  context: FormContext
  configs: EventFormConfigs
  copying: boolean
  onRequest: () => void
}) {
  const source = COPY_SOURCE[context]
  if (!source) return null

  const matches = sameConfig(configs[context], configs[source])
  const sourceLabel = FORM_CONTEXT_META[source].label

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-dashed px-4 py-3">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-medium">
          Match {sourceLabel}
          {matches && <Badge variant="secondary">In sync</Badge>}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {matches
            ? `Everything here is the same as ${sourceLabel}. Change a toggle below to differ.`
            : `Copy every section and field from ${sourceLabel}, then adjust as needed.`}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onRequest}
        disabled={copying || matches}
      >
        {copying ? "Copying…" : `Copy from ${sourceLabel}`}
      </Button>
    </div>
  )
}

/**
 * The success screen's sub copy (CCF-130).
 *
 * Sits outside the section accordion because it isn't a thing the form *asks* —
 * it's what the form *says* once someone is done. Left blank it falls back to the
 * built-in copy, which is shown as the placeholder so an admin can see exactly
 * what people will read without having to publish first.
 */
function SuccessMessageEditor({
  context,
  eventId,
  clusterId,
  eventName,
  initial,
}: {
  context: FormContext
  eventId?: string
  clusterId?: string
  eventName?: string
  initial: string | null
}) {
  const [value, setValue] = React.useState(initial ?? "")
  const [saved, setSaved] = React.useState(initial ?? "")
  const [saving, setSaving] = React.useState(false)

  const fallback = defaultSuccessMessage(context, eventName)
  const dirty = value.trim() !== saved.trim()
  const tooLong = value.length > SUCCESS_MESSAGE_MAX_LENGTH

  async function handleSave() {
    setSaving(true)
    const next = value.trim()
    const result = clusterId
      ? await saveClusterFormSuccessMessage(clusterId, context, next)
      : await saveEventFormSuccessMessage(eventId!, context, next)
    setSaving(false)
    if (result.success) {
      setSaved(next)
      setValue(next)
      toast.success(next ? "Success message saved" : "Reverted to the default message")
    } else {
      toast.error(result.error)
    }
  }

  return (
    <div className="space-y-3 rounded-lg border px-4 py-4">
      <div className="flex items-start gap-3">
        <IconMessage2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-medium">
            After they submit
            {!saved.trim() && <Badge variant="outline">Default</Badge>}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            The line under &ldquo;Welcome!&rdquo; on the success screen. Blank uses the default.
          </p>
        </div>
      </div>

      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={fallback}
        rows={3}
        aria-label={`Success message on ${FORM_CONTEXT_META[context].label}`}
        aria-invalid={tooLong}
      />

      <div className="flex items-center justify-between gap-3">
        <p
          className={cn(
            "text-xs",
            tooLong ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {value.length} / {SUCCESS_MESSAGE_MAX_LENGTH}
        </p>
        <div className="flex items-center gap-2">
          {dirty && !saving && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setValue(saved)}>
              Cancel
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={!dirty || saving || tooLong}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  )
}

function SectionItem({
  section,
  context,
  config,
  pending,
  onToggle,
  notApplicable = [],
  prerequisites,
}: {
  section: FormLayoutSection
  context: FormContext
  config: EventFormConfigData
  pending: string | null
  onToggle: (context: FormContext, key: FormPersistedKey) => void
  notApplicable?: readonly FormToggleKey[]
  prerequisites?: TogglePrerequisites
}) {
  const na = [...(NOT_APPLICABLE[context] ?? []), ...notApplicable]
  if (section.key !== "personal" && na.includes(section.key)) return null

  const fields = section.fields.filter((f) => !na.includes(f))
  const options = section.options.filter((o) => !na.includes(o))

  // The identity step is always part of the form — there is nothing to switch off,
  // so it has no toggle key of its own.
  const sectionKey = section.key === "personal" ? null : section.key
  const enabled = sectionKey === null || config[sectionKey]
  const Icon = TOGGLE_ICONS[section.key]

  const enabledCount = [...fields, ...options].filter((k) => config[k]).length
  const total = fields.length + options.length

  // Only worth saying when the section is on — an off section isn't expected to
  // render, so there is no surprise to explain.
  const warning =
    sectionKey !== null && enabled ? prerequisiteFor(prerequisites, sectionKey, context) : null

  return (
    <AccordionItem value={section.key} className="px-4">
      <div className="flex items-center gap-3">
        {/* AccordionTrigger renders its own flex Header, so it needs a growing
            wrapper to share the row with the switch. */}
        <div className="min-w-0 flex-1">
          <AccordionTrigger className="py-3 hover:no-underline">
            <span className="flex min-w-0 items-center gap-3 text-left">
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-medium">{section.title}</span>
                  {sectionKey === null ? (
                    <Badge variant="secondary">Always on</Badge>
                  ) : !enabled ? (
                    <Badge variant="outline">Off</Badge>
                  ) : (
                    warning && <Badge variant="outline">Won&apos;t show</Badge>
                  )}
                </span>
                {total > 0 && (
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {enabledCount} of {total} asked
                  </span>
                )}
              </span>
            </span>
          </AccordionTrigger>
        </div>

        {sectionKey !== null && (
          <Switch
            checked={enabled}
            onCheckedChange={() => onToggle(context, sectionKey)}
            disabled={pending === `${context}:${sectionKey}`}
            aria-label={`${section.title} on ${FORM_CONTEXT_META[context].label}`}
          />
        )}
      </div>

      <AccordionContent className="space-y-3 pb-4">
        <p className="text-xs text-muted-foreground">{section.description}</p>
        {section.note && <p className="text-xs text-muted-foreground">{section.note}</p>}
        {warning && <PrerequisiteNote message={warning} />}

        {/* Dietary and Payment add a step but no fields, so there is no field row
            to hang a Required switch off — the section *is* the question. Shown
            only while the section is on, matching how a field's Required switch
            hides when the field is off: there is nothing to require yet. */}
        {sectionKey !== null && isRequirableSection(sectionKey) && enabled && (
          <div className="flex items-center gap-3 border-t pt-3">
            <label
              htmlFor={`${context}-${sectionKey}-required`}
              className="min-w-0 flex-1 cursor-pointer text-sm"
            >
              Require an answer
              <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                Nobody can submit the form without answering this.
              </span>
            </label>
            <div className={cn(REQUIRED_COL, "flex shrink-0 justify-end")}>
              <Switch
                id={`${context}-${sectionKey}-required`}
                checked={config[requiredKeyFor(sectionKey)]}
                onCheckedChange={() => onToggle(context, requiredKeyFor(sectionKey))}
                disabled={pending === `${context}:${requiredKeyFor(sectionKey)}`}
                aria-label={`${section.title} is required on ${FORM_CONTEXT_META[context].label}`}
              />
            </div>
          </div>
        )}

        {total > 0 && (
          <div className="space-y-3">
            {/* Fields stay visible and checkable while the section is off — seeing
                what a section asks for is the point — but a note makes it clear
                nothing here is collected until the section itself is on. */}
            {!enabled && (
              <p className="text-xs text-muted-foreground">
                Turn on {section.title} to ask any of these.
              </p>
            )}

            {options.length > 0 && (
              <div className="space-y-0.5">
                {options.map((key) => (
                  <FieldRow
                    key={key}
                    meta={FORM_OPTION_META[key]}
                    checked={config[key]}
                    dimmed={!enabled}
                    context={context}
                    pending={pending}
                    onToggle={onToggle}
                    warning={
                      enabled && config[key] ? prerequisiteFor(prerequisites, key, context) : null
                    }
                  />
                ))}
              </div>
            )}

            {fields.length > 0 && (
              <div>
                {/* "Required" belongs over the column once, not beside every row:
                    repeated on each row it was the loudest word in the section and
                    read as five separate settings rather than one column. */}
                <div className="flex items-center gap-3 border-b pb-1.5">
                  <span className="type-label flex-1 text-muted-foreground">Ask for</span>
                  <span
                    className={cn(
                      REQUIRED_COL,
                      "type-label shrink-0 text-right text-muted-foreground"
                    )}
                  >
                    Required
                  </span>
                </div>
                <div className="mt-1 space-y-0.5">
                  {fields.map((key) => (
                    <FieldRow
                      key={key}
                      meta={FORM_FIELD_META[key]}
                      checked={config[key]}
                      dimmed={!enabled}
                      context={context}
                      pending={pending}
                      onToggle={onToggle}
                      required={{ key: requiredKeyFor(key), value: config[requiredKeyFor(key)] }}
                      lockedReason={identityLockReason(key, config)}
                      warning={
                        enabled && config[key] ? prerequisiteFor(prerequisites, key, context) : null
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  )
}

/**
 * Why the last remaining identity field can't be unticked, or null when the row
 * is free to toggle.
 *
 * The server refuses this write anyway, but an admin shouldn't have to try it to
 * find out: the checkbox goes inert with the reason underneath instead of
 * accepting a click that comes back as an error toast.
 */
function identityLockReason(
  key: FormFieldKey,
  config: EventFormConfigData
): string | null {
  if (!(IDENTITY_FIELD_KEYS as readonly string[]).includes(key)) return null
  if (!config[key]) return null
  // Would turning this one off leave anything identifying behind?
  if (hasIdentityField({ ...config, [key]: false })) return null
  return "Kept on because it's the only way this form can recognise someone who has registered before. Switch on the other one to free this up."
}

/**
 * Why an enabled toggle still won't appear on the form. Deliberately plain text
 * rather than an alert box — several can be on screen at once, and the point is
 * to be noticed while reading the section, not to shout.
 */
function PrerequisiteNote({ message }: { message: string }) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-500">
      <IconAlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </p>
  )
}

function FieldRow({
  meta,
  checked,
  dimmed,
  context,
  pending,
  onToggle,
  warning = null,
  required,
  lockedReason = null,
}: {
  meta: { key: FormToggleKey; label: string; description: string }
  checked: boolean
  dimmed: boolean
  context: FormContext
  pending: string | null
  onToggle: (context: FormContext, key: FormPersistedKey) => void
  warning?: string | null
  /**
   * Present only for fields — sections and options have no Required state. Null
   * renders the row exactly as it did before Required existed.
   */
  required?: { key: FormPersistedKey; value: boolean }
  /** Why this field can't be switched off, shown in place of nothing happening. */
  lockedReason?: string | null
}) {
  const id = `${context}-${meta.key}`
  return (
    <div
      className={cn(
        "-mx-2 flex items-start gap-3 rounded-md px-2 py-1.5 transition-colors",
        checked ? "hover:bg-muted/60" : "hover:bg-muted/40",
        dimmed && "opacity-60"
      )}
    >
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={() => onToggle(context, meta.key)}
        disabled={pending === `${context}:${meta.key}` || lockedReason !== null}
        className="mt-0.5"
      />
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
        <span className={cn("block text-sm", checked ? "font-medium" : "text-muted-foreground")}>
          {meta.label}
        </span>
        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
          {meta.description}
        </span>
        {lockedReason && (
          <span className="mt-1 block text-xs leading-snug text-muted-foreground">
            {lockedReason}
          </span>
        )}
        {warning && (
          <span className="mt-1 block">
            <PrerequisiteNote message={warning} />
          </span>
        )}
      </label>

      {/* The rail is always rendered, even for rows that have no Required control
          at all, so every description above wraps at the same width. */}
      <div className={cn(REQUIRED_COL, "flex shrink-0 justify-end pt-0.5")}>
        {/* Required is a second control rather than a third state on the first:
            "off / optional / required" as one widget reads as a scale, and the
            middle value is the one people misselect. Hidden while the field is
            off — there is nothing to require yet. */}
        {required && checked && (
          <Switch
            id={`${id}-required`}
            checked={required.value}
            onCheckedChange={() => onToggle(context, required.key)}
            disabled={pending === `${context}:${required.key}`}
            aria-label={`${meta.label} is required on ${FORM_CONTEXT_META[context].label}`}
          />
        )}
      </div>
    </div>
  )
}
