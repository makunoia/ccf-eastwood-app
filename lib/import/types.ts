export type ImportEntity = "member" | "event-registrant" | "volunteer" | "guest" | "small-group" | "breakout-group" | "session-attendance"

export type FieldDefinition = {
  key: string
  label: string
  required: boolean
  hint?: string
}

export type ParsedSheet = {
  name: string
  headers: string[]
  rows: string[][]
}

export type ParsedFile = {
  fileName: string
  sheets: ParsedSheet[]
}

export type ColumnMapping = Record<string, string> // fieldKey → header (or "" if unmapped)

export type DuplicateMatch = {
  rowIndex: number
  existingId: string
  existingType: "member" | "guest" | "small-group" | "breakout-group"
  existingName: string
  existingEmail: string | null
  existingPhone: string | null
  // "recognized" = person exists in the system but hasn't been processed in this context yet
  // undefined / absent = already exists in this context (e.g. already checked in)
  kind?: "recognized"
}

export type RowResolution = "use-existing" | "use-csv" | "create-new"

export type PreviewRow = {
  index: number
  mapped: Record<string, string>
  duplicate?: DuplicateMatch
  resolution: RowResolution
  validationError?: string
  // Mapped keys whose value repeats across the sheet (likely a placeholder/admin contact).
  // Drives the "import as separate person" warning and which fields to blank on import.
  sharedContactFields?: ("email" | "phone" | "mobileNumber")[]
}

export type ImportResult = {
  total: number
  created: number
  linked: number
  updated: number
  skipped: number
  errors: { row: number; message: string }[]
}

export type WizardStep = "upload" | "sheet-select" | "column-map" | "preview" | "leader-resolution" | "results"

export type UnmatchedLeaderRow = {
  rowIndex: number
  groupName: string
  leaderFirstName: string
  leaderLastName: string
  leaderEmail: string
  leaderMobile: string
}

export type LeaderResolution =
  | { type: "link"; memberId: string; memberName: string }
  | { type: "create"; firstName: string; lastName: string; email?: string; mobile?: string }
  | { type: "none" }

export type ImportWizardConfig = {
  entity: ImportEntity
  fields?: FieldDefinition[]
  useExistingEnriches?: boolean
  // When true, the wizard flags contact values (email/phone) repeated across rows as likely
  // placeholders and defaults those rows to the "create-new" resolution (drops the shared contact).
  detectSharedContacts?: boolean
  context?: {
    eventId?: string
    ministryId?: string
  }
  onSuccess?: () => void
}
