import { z } from "zod"

import { isExternalSatellite } from "@/lib/constants/ccf-satellites"

const nullableString = z
  .string()
  .optional()
  .transform((v) => (v === "" || v == null ? null : v.trim()))

const nullableInt = z
  .string()
  .optional()
  .transform((v) => (v === "" || v == null ? null : parseInt(v, 10)))
  .pipe(z.number().int().positive().nullable())

// Meeting times are optional — a group may only know which day it meets.
const nullableTime = z
  .string()
  .optional()
  .transform((v) => (v === "" || v == null ? null : v))
  .pipe(z.string().regex(/^\d{2}:\d{2}$/, "Invalid time format").nullable())

/**
 * Which side of the upward-accountability link the form is filling in. Optional
 * so callers that predate the selector (CSV import, seeds, tests) still parse —
 * the transform below infers it from whichever parent field they set.
 */
const parentScopeEnum = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.enum(["none", "group", "satellite"]).optional()
)

export const smallGroupSchema = z.object({
  name: z.string().min(1, "Group name is required").trim(),
  leaderId: z.string().min(1, "Leader is required"),
  parentScope: parentScopeEnum,
  parentGroupId: nullableString,
  parentSatellite: nullableString,
  groupType: z
    .preprocess((v) => (v === "" || v == null ? "Regular" : v), z.enum(["Regular", "Couples"])),
  lifeStageIds: z.array(z.string()).min(1, "At least one life stage is required"),
  genderFocus: z.enum(["Male", "Female", "Mixed"]),
  language: z.array(z.string()).default([]),
  ageRangeMin: nullableInt,
  ageRangeMax: nullableInt,
  meetingFormat: z.enum(["Online", "Hybrid", "InPerson"]),
  locationCity: nullableString,
  memberLimit: nullableInt,
  scheduleDayOfWeek: z
    .string()
    .min(1, "Meeting day is required")
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().min(0).max(6)),
  scheduleTimeStart: nullableTime,
  scheduleTimeEnd: nullableTime,
}).refine(
  // Only comparable when both times are given — either one alone is valid.
  (data) =>
    data.scheduleTimeStart == null ||
    data.scheduleTimeEnd == null ||
    data.scheduleTimeStart < data.scheduleTimeEnd,
  { message: "End time must be after start time", path: ["scheduleTimeEnd"] }
).transform((data) => {
  // Couples groups host married pairs — gender focus is always Mixed.
  const d = data.groupType === "Couples"
    ? { ...data, genderFocus: "Mixed" as const }
    : data

  // A group's leader reports either to a DGroup here or to a leader at another
  // CCF satellite — never both. The scope decides which side survives; when it
  // is absent (older callers) infer it from whichever field was populated.
  const scope =
    d.parentScope ??
    (d.parentSatellite ? "satellite" : d.parentGroupId ? "group" : "none")

  if (scope === "satellite") return { ...d, parentScope: scope, parentGroupId: null }
  if (scope === "group") return { ...d, parentScope: scope, parentSatellite: null }
  return { ...d, parentScope: scope, parentGroupId: null, parentSatellite: null }
}).refine(
  (data) => data.parentScope !== "satellite" || !!data.parentSatellite,
  {
    message: "Select which CCF satellite the leader belongs to",
    path: ["parentSatellite"],
  }
).refine(
  (data) => data.parentSatellite == null || isExternalSatellite(data.parentSatellite),
  { message: "Unknown CCF satellite", path: ["parentSatellite"] }
)

export type SmallGroupInput = z.infer<typeof smallGroupSchema>

/**
 * The member portal's upward-accountability write. A leader whose own DGroup
 * leader sits outside CCF Eastwood has nobody here to request to join, so they
 * name the satellite instead; `null` (or "") clears it and puts them back on the
 * request-to-join path. Same allow-list as the admin form's `parentSatellite`.
 */
export const upwardSatelliteSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => (v == null || v.trim() === "" ? null : v.trim()))
  .refine((v) => v == null || isExternalSatellite(v), "Unknown CCF satellite")

// Raw form values (before transform) — used as the form state type
export type SmallGroupParentScope = "none" | "group" | "satellite"

export type SmallGroupFormValues = {
  name: string
  leaderId: string
  parentScope: SmallGroupParentScope
  parentGroupId: string
  parentSatellite: string
  groupType: string
  lifeStageIds: string[]
  genderFocus: string
  language: string[]
  ageRangeMin: string
  ageRangeMax: string
  meetingFormat: string
  locationCity: string
  memberLimit: string
  scheduleDayOfWeek: string  // "0"–"6" or ""
  scheduleTimeStart: string  // "HH:MM" or ""
  scheduleTimeEnd: string    // "HH:MM" or ""
}

export const defaultSmallGroupForm: SmallGroupFormValues = {
  name: "",
  leaderId: "",
  parentScope: "none",
  parentGroupId: "",
  parentSatellite: "",
  groupType: "Regular",
  lifeStageIds: [],
  genderFocus: "",
  language: [],
  ageRangeMin: "",
  ageRangeMax: "",
  meetingFormat: "",
  locationCity: "",
  memberLimit: "",
  scheduleDayOfWeek: "",
  scheduleTimeStart: "",
  scheduleTimeEnd: "",
}
