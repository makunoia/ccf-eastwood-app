"use client"

import * as React from "react"
import {
  IconCake,
  IconCalendarTime,
  IconCash,
  IconDeviceLaptop,
  IconFriends,
  IconHeart,
  IconLanguage,
  IconMapPin,
  IconNumbers,
  IconSalad,
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
import { cn } from "@/lib/utils"
import {
  BARE_EVENT_FORM_CONFIG,
  FORM_CONTEXT_META,
  FORM_FIELD_META,
  FORM_OPTION_META,
  FORM_TOGGLE_KEYS,
  formLayoutFor,
  type EventFormConfigData,
  type FormLayoutSection,
  type FormToggleKey,
} from "@/lib/forms/context-config"
import {
  copyEventFormConfig,
  setEventFormToggle,
} from "@/app/(dashboard)/events/form-config-actions"
import type { FormContext } from "@/app/generated/prisma/client"

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
 * date input at all.
 */
const NOT_APPLICABLE: Partial<Record<FormContext, FormToggleKey[]>> = {
  CheckIn: ["sectionPayment", "sectionBreakout", "fieldBirthDate"],
}

/** Default tab order when a caller doesn't narrow it. */
const CONTEXT_ORDER: FormContext[] = ["Register", "WalkIn", "CheckIn"]

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
  return FORM_TOGGLE_KEYS.every((key) => a[key] === b[key])
}

export type EventFormConfigs = Record<FormContext, EventFormConfigData>

export function EventFormBuilder({
  eventId,
  initial,
  /**
   * Which surfaces this instance configures. Register and Walk-in live on the
   * Registration form page (they drive the same component); Check-in is its own
   * form with its own page, so it passes just `["CheckIn"]`.
   */
  contexts = CONTEXT_ORDER,
  heading = "Registration form",
  blurb = "Each surface is configured on its own, and listed in the order people see it. Name, mobile number, and email are always collected — everything else is opt-in.",
}: {
  eventId: string
  initial: EventFormConfigs
  contexts?: readonly FormContext[]
  heading?: string
  blurb?: string
}) {
  const [configs, setConfigs] = React.useState<EventFormConfigs>(initial)
  const [pending, setPending] = React.useState<string | null>(null)
  const [copying, setCopying] = React.useState<FormContext | null>(null)
  const [confirmCopy, setConfirmCopy] = React.useState<FormContext | null>(null)

  async function handleCopy(target: FormContext) {
    const source = COPY_SOURCE[target]
    if (!source) return
    setConfirmCopy(null)
    setCopying(target)
    const result = await copyEventFormConfig(eventId, source, target)
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

  async function handleToggle(context: FormContext, key: FormToggleKey) {
    const next = !configs[context][key]
    setPending(`${context}:${key}`)
    // Optimistic — reverted below if the write fails.
    setConfigs((prev) => ({
      ...prev,
      [context]: { ...prev[context], [key]: next },
    }))
    const result = await setEventFormToggle(eventId, context, key, next)
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
                />
              ))}
            </Accordion>
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

function SectionItem({
  section,
  context,
  config,
  pending,
  onToggle,
}: {
  section: FormLayoutSection
  context: FormContext
  config: EventFormConfigData
  pending: string | null
  onToggle: (context: FormContext, key: FormToggleKey) => void
}) {
  const na = NOT_APPLICABLE[context] ?? []
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
                  ) : (
                    !enabled && <Badge variant="outline">Off</Badge>
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

        {total > 0 && (
          <div className="space-y-2">
            {/* Fields stay visible and checkable while the section is off — seeing
                what a section asks for is the point — but a note makes it clear
                nothing here is collected until the section itself is on. */}
            {!enabled && (
              <p className="text-xs text-muted-foreground">
                Turn on {section.title} to ask any of these.
              </p>
            )}
            {options.map((key) => (
              <FieldRow
                key={key}
                meta={FORM_OPTION_META[key]}
                checked={config[key]}
                dimmed={!enabled}
                context={context}
                pending={pending}
                onToggle={onToggle}
              />
            ))}
            {fields.map((key) => (
              <FieldRow
                key={key}
                meta={FORM_FIELD_META[key]}
                checked={config[key]}
                dimmed={!enabled}
                context={context}
                pending={pending}
                onToggle={onToggle}
              />
            ))}
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  )
}

function FieldRow({
  meta,
  checked,
  dimmed,
  context,
  pending,
  onToggle,
}: {
  meta: { key: FormToggleKey; label: string; description: string }
  checked: boolean
  dimmed: boolean
  context: FormContext
  pending: string | null
  onToggle: (context: FormContext, key: FormToggleKey) => void
}) {
  const id = `${context}-${meta.key}`
  return (
    <div className={cn("flex items-start gap-3", dimmed && "opacity-60")}>
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={() => onToggle(context, meta.key)}
        disabled={pending === `${context}:${meta.key}`}
        className="mt-0.5"
      />
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-sm font-medium">{meta.label}</span>
        <span className="block text-xs text-muted-foreground">{meta.description}</span>
      </label>
    </div>
  )
}
