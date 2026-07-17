import type { FieldDefinition, ImportEntity } from "./types"

export const MEMBER_FIELDS: FieldDefinition[] = [
  { key: "firstName",        label: "First Name",         required: true },
  { key: "lastName",         label: "Last Name",          required: true },
  { key: "nickname",         label: "Nickname",           required: false },
  { key: "dateJoined",       label: "Date Joined",        required: true,  hint: "e.g. 2024-01-15" },
  { key: "email",            label: "Email",              required: false },
  { key: "phone",            label: "Phone",              required: false },
  { key: "address",          label: "Address",            required: false },
  { key: "gender",           label: "Gender",             required: false, hint: "Male or Female" },
  { key: "language",         label: "Language",           required: false },
  { key: "birthMonth",       label: "Birth Month",        required: false, hint: "1–12" },
  { key: "birthYear",        label: "Birth Year",         required: false, hint: "e.g. 1995" },
  { key: "workCity",         label: "Work City",          required: false },
  { key: "workIndustry",     label: "Work Industry",      required: false },
  { key: "meetingPreference",label: "Meeting Preference", required: false, hint: "Online, Hybrid, or InPerson" },
  { key: "notes",            label: "Notes",              required: false },
]

export const EVENT_REGISTRANT_FIELDS: FieldDefinition[] = [
  { key: "firstName",       label: "First Name",    required: true },
  { key: "lastName",        label: "Last Name",     required: true },
  { key: "email",           label: "Email",         required: false },
  { key: "mobileNumber",    label: "Mobile Number", required: false },
  { key: "nickname",        label: "Nickname",      required: false },
  { key: "gender",          label: "Gender",        required: false, hint: "Male or Female" },
  { key: "birthMonth",      label: "Birth Month",   required: false, hint: "1–12" },
  { key: "birthYear",       label: "Birth Year",    required: false, hint: "e.g. 1995" },
]

const EVENT_REGISTRANT_PAYMENT_REFERENCE_FIELD: FieldDefinition = {
  key: "paymentReference",
  label: "Payment Reference",
  required: false,
}

export function getEventRegistrantFields(options?: { includePaymentReference?: boolean }): FieldDefinition[] {
  return options?.includePaymentReference
    ? [...EVENT_REGISTRANT_FIELDS, EVENT_REGISTRANT_PAYMENT_REFERENCE_FIELD]
    : EVENT_REGISTRANT_FIELDS
}

export const VOLUNTEER_FIELDS: FieldDefinition[] = [
  { key: "email",          label: "Email",          required: false, hint: "Used to match existing Member" },
  { key: "phone",          label: "Phone",          required: false, hint: "Used to match existing Member" },
  { key: "firstName",      label: "First Name",     required: true,  hint: "For new Member creation if no match" },
  { key: "lastName",       label: "Last Name",      required: true,  hint: "For new Member creation if no match" },
  { key: "committeeName",  label: "Committee Name", required: true,  hint: "Must match an existing committee" },
  { key: "roleName",       label: "Role Name",      required: true,  hint: "Must match a role in that committee" },
  { key: "status",         label: "Status",         required: false, hint: "Pending, Confirmed, or Rejected" },
  { key: "notes",          label: "Notes",          required: false },
]

export const GUEST_FIELDS: FieldDefinition[] = [
  { key: "firstName",  label: "First Name",  required: true },
  { key: "lastName",   label: "Last Name",   required: true },
  { key: "nickname",   label: "Nickname",    required: false },
  { key: "email",      label: "Email",       required: false },
  { key: "phone",      label: "Phone",       required: false },
  { key: "gender",     label: "Gender",      required: false, hint: "Male or Female" },
  { key: "birthMonth", label: "Birth Month", required: false, hint: "1–12" },
  { key: "birthYear",  label: "Birth Year",  required: false, hint: "e.g. 1995" },
  { key: "notes",      label: "Notes",       required: false },
]

export const SMALL_GROUP_FIELDS: FieldDefinition[] = [
  { key: "name",             label: "Group Name",         required: true },
  { key: "leaderFirstName",  label: "Leader First Name",  required: false },
  { key: "leaderLastName",   label: "Leader Last Name",   required: false },
  { key: "leaderMobile",     label: "Leader Mobile",      required: false, hint: "Primary lookup — matched by mobile number" },
  { key: "leaderEmail",      label: "Leader Email",       required: false, hint: "Fallback lookup — used if mobile not provided or not found" },
  { key: "parentGroupName",  label: "Parent Group",       required: false, hint: "Must match an existing group's name" },
  { key: "groupType",        label: "Group Type",      required: false, hint: "Regular or Couples — blank defaults to Regular" },
  { key: "lifeStage",        label: "Life Stage",      required: false, hint: "Must match an existing life stage name" },
  { key: "genderFocus",      label: "Gender Focus",    required: false, hint: "Male, Female, or Mixed — always Mixed for Couples groups" },
  { key: "language",         label: "Language",        required: false },
  { key: "ageRangeMin",      label: "Min Age",         required: false },
  { key: "ageRangeMax",      label: "Max Age",         required: false },
  { key: "meetingFormat",    label: "Meeting Format",  required: false, hint: "Online, Hybrid, or InPerson" },
  { key: "locationCity",     label: "Location City",   required: false },
  { key: "memberLimit",      label: "Member Limit",    required: false },
  { key: "scheduleDayOfWeek",label: "Meeting Day",       required: false, hint: "Sunday–Saturday or 0–6" },
  { key: "scheduleTime",     label: "Meeting Time Start", required: false, hint: "HH:MM (24-hour)" },
  { key: "scheduleTimeEnd",  label: "Meeting Time End",   required: false, hint: "HH:MM (24-hour) — defaults to start + 2 hrs if blank" },
]

// Breakout groups inherit their matching profile (life stage, gender, language,
// age, meeting format, location, schedule) from the facilitator's linked small
// group, so those columns are intentionally omitted from the import.
export const BREAKOUT_GROUP_FIELDS: FieldDefinition[] = [
  { key: "name",              label: "Group Name",         required: true },
  { key: "facilitatorMobile", label: "Facilitator Mobile", required: false, hint: "Matched by mobile against an existing event volunteer. Their small group is linked automatically." },
  { key: "memberLimit",       label: "Member Limit",       required: false },
]

export const SESSION_ATTENDANCE_FIELDS: FieldDefinition[] = [
  { key: "firstName",    label: "First Name",    required: true },
  { key: "lastName",     label: "Last Name",     required: true },
  { key: "mobileNumber", label: "Mobile Number", required: false },
  { key: "email",        label: "Email",         required: false },
  { key: "gender",       label: "Gender",        required: false, hint: "Male or Female" },
  { key: "birthMonth",   label: "Birth Month",   required: false, hint: "1–12" },
  { key: "birthYear",    label: "Birth Year",    required: false, hint: "e.g. 1995" },
  { key: "checkedInAt",  label: "Checked In At", required: false, hint: "e.g. 10:30 AM or 14:30 — defaults to session date" },
]

export function getFieldsForEntity(entity: ImportEntity): FieldDefinition[] {
  switch (entity) {
    case "member":             return MEMBER_FIELDS
    case "event-registrant":   return getEventRegistrantFields()
    case "volunteer":          return VOLUNTEER_FIELDS
    case "guest":              return GUEST_FIELDS
    case "small-group":        return SMALL_GROUP_FIELDS
    case "breakout-group":     return BREAKOUT_GROUP_FIELDS
    case "session-attendance": return SESSION_ATTENDANCE_FIELDS
  }
}

export function getEntityLabel(entity: ImportEntity): string {
  switch (entity) {
    case "member":             return "Members"
    case "event-registrant":   return "Event Registrants"
    case "volunteer":          return "Volunteers"
    case "guest":              return "Guests"
    case "small-group":        return "Small Groups"
    case "breakout-group":     return "Breakout Groups"
    case "session-attendance": return "Session Attendance"
  }
}
