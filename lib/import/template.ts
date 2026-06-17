"use client"

import { downloadCSV } from "@/lib/csv-export"
import { getFieldsForEntity, getEntityLabel } from "./field-definitions"
import type { ImportEntity, FieldDefinition } from "./types"

// Realistic-looking sample row, keyed by field key. Any entity that uses the same
// field key gets the same sample value — keeps the templates consistent across imports.
const SAMPLE_VALUES: Record<string, string> = {
  // Names / contact
  firstName:        "Juan",
  lastName:         "Cruz",
  nickname:         "JC",
  email:            "juan.cruz@example.com",
  phone:            "09171234567",
  mobileNumber:     "09171234567",
  address:          "123 Sample St, Quezon City",

  // Member-only
  dateJoined:       "2024-01-15",

  // Matching fields
  gender:           "Male",
  language:         "English",
  birthMonth:       "5",
  birthYear:        "1995",
  workCity:         "Makati",
  workIndustry:     "Technology",
  meetingPreference:"Hybrid",
  notes:            "",

  // Event registrant
  paymentReference: "REF-001",

  // Volunteer
  committeeName:    "Hospitality",
  roleName:         "Greeter",
  status:           "Pending",

  // Small group
  name:             "Eastwood Pioneers",
  leaderFirstName:  "Maria",
  leaderLastName:   "Santos",
  leaderMobile:     "09181234567",
  leaderEmail:      "maria.santos@example.com",
  parentGroupName:  "",
  lifeStage:        "Young Professional",
  genderFocus:      "Mixed",
  ageRangeMin:      "21",
  ageRangeMax:      "35",
  meetingFormat:    "InPerson",
  locationCity:     "Quezon City",
  memberLimit:      "12",
  scheduleDayOfWeek:"Wednesday",
  scheduleTime:     "19:00",
  scheduleTimeEnd:  "21:00",

  // Breakout group
  facilitatorMobile: "09181234567",

  // Session attendance
  checkedInAt:      "10:30 AM",
}

function sampleFor(field: FieldDefinition): string {
  return SAMPLE_VALUES[field.key] ?? ""
}

function templateHeader(field: FieldDefinition): string {
  // We keep the header equal to the field label so auto-mapping in the import wizard
  // matches it back exactly (case-insensitive on round-trip).
  return field.label
}

function fileSlug(entity: ImportEntity): string {
  return entity.replace(/[^a-z0-9-]/gi, "-").toLowerCase()
}

export function downloadImportTemplate(entity: ImportEntity, fields = getFieldsForEntity(entity)): void {
  const headers = fields.map(templateHeader)
  const sampleRow = fields.map(sampleFor)
  const filename = `${fileSlug(entity)}-import-template.csv`
  downloadCSV(filename, headers, [sampleRow])
}

export function entityTemplateLabel(entity: ImportEntity): string {
  return `${getEntityLabel(entity)} template`
}
