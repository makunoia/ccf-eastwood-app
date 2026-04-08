export type ImportEntity = "member" | "event-registrant" | "volunteer"

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
  existingType: "member" | "guest"
  existingName: string
  existingEmail: string | null
  existingPhone: string | null
}

export type RowResolution = "use-existing" | "use-csv"

export type PreviewRow = {
  index: number
  mapped: Record<string, string>
  duplicate?: DuplicateMatch
  resolution: RowResolution
  validationError?: string
}

export type ImportResult = {
  total: number
  created: number
  linked: number
  updated: number
  skipped: number
  errors: { row: number; message: string }[]
}

export type WizardStep = "upload" | "sheet-select" | "column-map" | "preview" | "results"

export type ImportWizardConfig = {
  entity: ImportEntity
  context?: {
    eventId?: string
    ministryId?: string
  }
  onSuccess?: () => void
}
