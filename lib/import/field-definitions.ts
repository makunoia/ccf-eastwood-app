import type { FieldDefinition, ImportEntity } from "./types"

export const MEMBER_FIELDS: FieldDefinition[] = [
  { key: "firstName",        label: "First Name",         required: true },
  { key: "lastName",         label: "Last Name",          required: true },
  { key: "dateJoined",       label: "Date Joined",        required: true,  hint: "e.g. 2024-01-15" },
  { key: "email",            label: "Email",              required: false },
  { key: "phone",            label: "Phone",              required: false },
  { key: "address",          label: "Address",            required: false },
  { key: "gender",           label: "Gender",             required: false, hint: "Male or Female" },
  { key: "language",         label: "Language",           required: false },
  { key: "birthDate",        label: "Birth Date",         required: false, hint: "e.g. 1995-06-20" },
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
  { key: "isPaid",          label: "Is Paid",       required: false, hint: "true/false or yes/no" },
  { key: "paymentReference",label: "Payment Ref",   required: false },
]

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
  { key: "firstName", label: "First Name", required: true },
  { key: "lastName",  label: "Last Name",  required: true },
  { key: "email",     label: "Email",      required: false },
  { key: "phone",     label: "Phone",      required: false },
  { key: "notes",     label: "Notes",      required: false },
]

export const SMALL_GROUP_FIELDS: FieldDefinition[] = [
  { key: "name",            label: "Group Name",      required: true },
  { key: "leaderEmail",     label: "Leader Email",    required: true,  hint: "Must match an existing member's email" },
  { key: "parentGroupName", label: "Parent Group",    required: false, hint: "Must match an existing group's name" },
  { key: "lifeStage",       label: "Life Stage",      required: false, hint: "Must match an existing life stage name" },
  { key: "genderFocus",     label: "Gender Focus",    required: false, hint: "Male, Female, or Mixed" },
  { key: "language",        label: "Language",        required: false },
  { key: "ageRangeMin",     label: "Min Age",         required: false },
  { key: "ageRangeMax",     label: "Max Age",         required: false },
  { key: "meetingFormat",   label: "Meeting Format",  required: false, hint: "Online, Hybrid, or InPerson" },
  { key: "locationCity",    label: "Location City",   required: false },
  { key: "memberLimit",     label: "Member Limit",    required: false },
]

export function getFieldsForEntity(entity: ImportEntity): FieldDefinition[] {
  switch (entity) {
    case "member":            return MEMBER_FIELDS
    case "event-registrant":  return EVENT_REGISTRANT_FIELDS
    case "volunteer":         return VOLUNTEER_FIELDS
    case "guest":             return GUEST_FIELDS
    case "small-group":       return SMALL_GROUP_FIELDS
  }
}

export function getEntityLabel(entity: ImportEntity): string {
  switch (entity) {
    case "member":            return "Members"
    case "event-registrant":  return "Event Registrants"
    case "volunteer":         return "Volunteers"
    case "guest":             return "Guests"
    case "small-group":       return "Small Groups"
  }
}
