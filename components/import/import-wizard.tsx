"use client"

import * as React from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { parseFile } from "@/lib/import/parse-file"
import { getFieldsForEntity, getEntityLabel } from "@/lib/import/field-definitions"
import type {
  ImportWizardConfig,
  WizardStep,
  ParsedFile,
  ColumnMapping,
  PreviewRow,
  RowResolution,
  DuplicateMatch,
  ImportResult,
} from "@/lib/import/types"
import { StepUpload } from "./steps/step-upload"
import { StepSheetSelect } from "./steps/step-sheet-select"
import { StepColumnMap } from "./steps/step-column-map"
import { StepPreview } from "./steps/step-preview"
import { StepResults } from "./steps/step-results"

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STEP_LABELS: Record<WizardStep, string> = {
  "upload":       "Upload",
  "sheet-select": "Select Sheet",
  "column-map":   "Map Columns",
  "preview":      "Preview",
  "results":      "Results",
}

function stepIndex(step: WizardStep, hasSheetSelect: boolean): number {
  const all: WizardStep[] = ["upload", "sheet-select", "column-map", "preview", "results"]
  const visible = hasSheetSelect ? all : all.filter((s) => s !== "sheet-select")
  return visible.indexOf(step)
}

function applyMapping(
  headers: string[],
  rows: string[][],
  mapping: ColumnMapping,
): Record<string, string>[] {
  return rows.map((row) => {
    const mapped: Record<string, string> = {}
    for (const [fieldKey, header] of Object.entries(mapping)) {
      if (!header) continue
      const colIdx = headers.indexOf(header)
      mapped[fieldKey] = colIdx >= 0 ? (row[colIdx] ?? "") : ""
    }
    return mapped
  })
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  config: ImportWizardConfig
  open: boolean
  onOpenChange: (v: boolean) => void
  // Server actions injected per-entity (avoids dynamic imports)
  onCheckDuplicates: (
    rows: { email?: string; phone?: string }[]
  ) => Promise<{ success: true; data: DuplicateMatch[] } | { success: false; error: string }>
  onImport: (
    rows: Array<{ mapped: Record<string, string>; resolution: RowResolution; existingId?: string; existingType?: "member" | "guest" }>
  ) => Promise<{ success: true; data: ImportResult } | { success: false; error: string }>
}

// ─── Wizard ───────────────────────────────────────────────────────────────────

export function ImportWizard({ config, open, onOpenChange, onCheckDuplicates, onImport }: Props) {
  const fields = getFieldsForEntity(config.entity)
  const entityLabel = getEntityLabel(config.entity)

  const [step, setStep] = React.useState<WizardStep>("upload")
  const [parsedFile, setParsedFile] = React.useState<ParsedFile | null>(null)
  const [selectedSheet, setSelectedSheet] = React.useState(0)
  const [mapping, setMapping] = React.useState<ColumnMapping>({})
  const [mappingErrors, setMappingErrors] = React.useState<Record<string, string>>({})
  const [previewRows, setPreviewRows] = React.useState<PreviewRow[]>([])
  const [checking, setChecking] = React.useState(false)
  const [importing, setImporting] = React.useState(false)
  const [result, setResult] = React.useState<ImportResult | null>(null)
  const [fileLoading, setFileLoading] = React.useState(false)

  const sheet = parsedFile?.sheets[selectedSheet]
  const hasSheetSelect = (parsedFile?.sheets.length ?? 0) > 1

  // Reset when dialog closes
  function handleOpenChange(v: boolean) {
    if (!v) {
      setStep("upload")
      setParsedFile(null)
      setSelectedSheet(0)
      setMapping({})
      setMappingErrors({})
      setPreviewRows([])
      setResult(null)
    }
    onOpenChange(v)
  }

  // ── Step 1: File selected ──
  async function handleFileParsed(file: File) {
    setFileLoading(true)
    try {
      const parsed = await parseFile(file)
      setParsedFile(parsed)
      setSelectedSheet(0)
      // Auto-map: if a header matches a field label (case-insensitive), pre-select it
      const firstSheet = parsed.sheets[0]
      if (firstSheet) {
        const autoMap: ColumnMapping = {}
        for (const field of fields) {
          const match = firstSheet.headers.find(
            (h) => h.toLowerCase() === field.label.toLowerCase() ||
                   h.toLowerCase() === field.key.toLowerCase()
          )
          autoMap[field.key] = match ?? ""
        }
        setMapping(autoMap)
      }
      if (parsed.sheets.length > 1) {
        setStep("sheet-select")
      } else {
        setStep("column-map")
      }
    } catch {
      toast.error("Failed to parse file. Check that the file isn't corrupted.")
    } finally {
      setFileLoading(false)
    }
  }

  // ── Step 2: Sheet selected → column map ──
  function handleSheetConfirm() {
    const s = parsedFile?.sheets[selectedSheet]
    if (!s) return
    // Re-run auto-map for selected sheet
    const autoMap: ColumnMapping = {}
    for (const field of fields) {
      const match = s.headers.find(
        (h) => h.toLowerCase() === field.label.toLowerCase() ||
               h.toLowerCase() === field.key.toLowerCase()
      )
      autoMap[field.key] = match ?? ""
    }
    setMapping(autoMap)
    setMappingErrors({})
    setStep("column-map")
  }

  // ── Step 3: Validate mapping → preview ──
  async function handleMappingConfirm() {
    const errors: Record<string, string> = {}
    for (const field of fields) {
      if (field.required && !mapping[field.key]) {
        errors[field.key] = "Required — please map this field"
      }
    }
    if (Object.keys(errors).length > 0) {
      setMappingErrors(errors)
      return
    }
    setMappingErrors({})
    if (!sheet) return

    // Build preview rows
    const mappedData = applyMapping(sheet.headers, sheet.rows, mapping)
    const rows: PreviewRow[] = mappedData.map((mapped, i) => ({
      index: i,
      mapped,
      resolution: "use-existing",
    }))
    setPreviewRows(rows)
    setStep("preview")

    // Check duplicates
    setChecking(true)
    const lookups = rows.map((r) => ({
      email: r.mapped["email"] || undefined,
      phone: r.mapped["phone"] || r.mapped["mobileNumber"] || undefined,
    }))
    const dupResult = await onCheckDuplicates(lookups)
    setChecking(false)
    if (!dupResult.success) {
      toast.error(dupResult.error)
      return
    }
    const dupMap = new Map(dupResult.data.map((d) => [d.rowIndex, d]))
    setPreviewRows((prev) =>
      prev.map((row) => {
        const dup = dupMap.get(row.index)
        return dup ? { ...row, duplicate: dup, resolution: "use-existing" } : row
      })
    )
  }

  // ── Step 4: Run import ──
  async function handleImport() {
    setImporting(true)
    const payload = previewRows.map((row) => ({
      mapped: row.mapped,
      resolution: row.resolution,
      existingId: row.duplicate?.existingId,
      existingType: row.duplicate?.existingType,
    }))
    const importResult = await onImport(payload)
    setImporting(false)
    if (!importResult.success) {
      toast.error(importResult.error)
      return
    }
    setResult(importResult.data)
    setStep("results")
    config.onSuccess?.()
  }

  // ── Duplicate resolution ──
  function handleResolutionChange(rowIndex: number, resolution: RowResolution) {
    setPreviewRows((prev) =>
      prev.map((r) => r.index === rowIndex ? { ...r, resolution } : r)
    )
  }

  function handleSetAllResolution(resolution: RowResolution) {
    setPreviewRows((prev) =>
      prev.map((r) => r.duplicate ? { ...r, resolution } : r)
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  const visibleSteps: WizardStep[] = hasSheetSelect
    ? ["upload", "sheet-select", "column-map", "preview", "results"]
    : ["upload", "column-map", "preview", "results"]
  const currentIdx = stepIndex(step, hasSheetSelect)

  function renderStep() {
    switch (step) {
      case "upload":
        return <StepUpload onFileParsed={handleFileParsed} loading={fileLoading} />
      case "sheet-select":
        return (
          <StepSheetSelect
            sheets={parsedFile?.sheets ?? []}
            selected={selectedSheet}
            onSelect={setSelectedSheet}
          />
        )
      case "column-map":
        return (
          <StepColumnMap
            fields={fields}
            headers={sheet?.headers ?? []}
            mapping={mapping}
            onChange={setMapping}
            errors={mappingErrors}
          />
        )
      case "preview":
        return (
          <StepPreview
            fields={fields}
            rows={previewRows}
            checking={checking}
            onResolutionChange={handleResolutionChange}
            onSetAllResolution={handleSetAllResolution}
          />
        )
      case "results":
        return result ? <StepResults result={result} /> : null
    }
  }

  function renderFooter() {
    switch (step) {
      case "upload":
        return null // navigated by file selection
      case "sheet-select":
        return (
          <>
            <Button variant="outline" onClick={() => setStep("upload")}>Back</Button>
            <Button onClick={handleSheetConfirm}>Next</Button>
          </>
        )
      case "column-map":
        return (
          <>
            <Button variant="outline" onClick={() => setStep(hasSheetSelect ? "sheet-select" : "upload")}>Back</Button>
            <Button onClick={handleMappingConfirm}>Preview</Button>
          </>
        )
      case "preview":
        return (
          <>
            <Button variant="outline" onClick={() => setStep("column-map")} disabled={importing}>Back</Button>
            <Button onClick={handleImport} disabled={importing || checking}>
              {importing ? "Importing…" : `Import ${previewRows.length} row${previewRows.length !== 1 ? "s" : ""}`}
            </Button>
          </>
        )
      case "results":
        return <Button onClick={() => handleOpenChange(false)}>Close</Button>
    }
  }

  const isWide = step === "preview" || step === "results"

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={isWide ? "sm:max-w-4xl" : "sm:max-w-lg"}>
        <DialogHeader>
          <DialogTitle>Import {entityLabel}</DialogTitle>
          {/* Step indicator */}
          <div className="flex items-center gap-1 pt-1">
            {visibleSteps.map((s, i) => (
              <React.Fragment key={s}>
                <div className={[
                  "h-1.5 rounded-full flex-1 transition-colors",
                  i <= currentIdx ? "bg-primary" : "bg-muted",
                ].join(" ")} />
              </React.Fragment>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Step {currentIdx + 1} of {visibleSteps.length} — {STEP_LABELS[step]}
          </p>
        </DialogHeader>

        <div className="py-2">{renderStep()}</div>

        {renderFooter() && (
          <DialogFooter>{renderFooter()}</DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
