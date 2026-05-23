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
  UnmatchedLeaderRow,
  LeaderResolution,
} from "@/lib/import/types"
import { StepUpload } from "./steps/step-upload"
import { StepSheetSelect } from "./steps/step-sheet-select"
import { StepColumnMap } from "./steps/step-column-map"
import { StepPreview } from "./steps/step-preview"
import { StepLeaderResolution } from "./steps/step-leader-resolution"
import { StepResults } from "./steps/step-results"

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STEP_LABELS: Record<WizardStep, string> = {
  "upload":            "Upload",
  "sheet-select":      "Select Sheet",
  "column-map":        "Map Columns",
  "preview":           "Preview",
  "leader-resolution": "Resolve Leaders",
  "results":           "Results",
}

function getVisibleSteps(hasSheetSelect: boolean, hasLeaderResolution: boolean): WizardStep[] {
  const all: WizardStep[] = ["upload", "sheet-select", "column-map", "preview", "leader-resolution", "results"]
  return all.filter((s) => {
    if (s === "sheet-select"      && !hasSheetSelect)      return false
    if (s === "leader-resolution" && !hasLeaderResolution) return false
    return true
  })
}

function stepIndex(step: WizardStep, visibleSteps: WizardStep[]): number {
  return visibleSteps.indexOf(step)
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

// ─── Types ────────────────────────────────────────────────────────────────────

type MemberRecord = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
}

type Props = {
  config: ImportWizardConfig
  open: boolean
  onOpenChange: (v: boolean) => void
  onCheckDuplicates: (
    rows: { email?: string; phone?: string; name?: string }[]
  ) => Promise<{ success: true; data: DuplicateMatch[] } | { success: false; error: string }>
  onImport: (
    rows: Array<{
      mapped: Record<string, string>
      resolution: RowResolution
      existingId?: string
      existingType?: "member" | "guest" | "small-group"
      leaderId?: string
      createLeader?: { type: "create"; firstName: string; lastName: string; email?: string; mobile?: string }
    }>
  ) => Promise<{ success: true; data: ImportResult } | { success: false; error: string }>
  // Optional — only needed for small-group imports
  onCheckLeaders?: (
    rows: Array<{
      index: number
      groupName?: string
      leaderFirstName?: string
      leaderLastName?: string
      leaderEmail?: string
      leaderMobile?: string
    }>
  ) => Promise<{ success: true; data: UnmatchedLeaderRow[] } | { success: false; error: string }>
  onLoadMembers?: () => Promise<{ success: true; data: MemberRecord[] } | { success: false; error: string }>
}

// ─── Wizard ───────────────────────────────────────────────────────────────────

export function ImportWizard({ config, open, onOpenChange, onCheckDuplicates, onImport, onCheckLeaders, onLoadMembers }: Props) {
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

  // Leader resolution state
  const [unmatchedLeaderRows, setUnmatchedLeaderRows] = React.useState<UnmatchedLeaderRow[]>([])
  const [leaderResolutions, setLeaderResolutions] = React.useState<Map<number, LeaderResolution>>(new Map())
  const [checkingLeaders, setCheckingLeaders] = React.useState(false)
  const [members, setMembers] = React.useState<MemberRecord[]>([])
  const [membersLoading, setMembersLoading] = React.useState(false)

  const sheet = parsedFile?.sheets[selectedSheet]
  const hasSheetSelect = (parsedFile?.sheets.length ?? 0) > 1
  const hasLeaderResolution = unmatchedLeaderRows.length > 0
  const visibleSteps = getVisibleSteps(hasSheetSelect, hasLeaderResolution)
  const currentIdx = stepIndex(step, visibleSteps)

  const allLeadersResolved =
    unmatchedLeaderRows.length === 0 ||
    unmatchedLeaderRows.every((r) => leaderResolutions.has(r.rowIndex))

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
      setUnmatchedLeaderRows([])
      setLeaderResolutions(new Map())
      setMembers([])
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

    const mappedData = applyMapping(sheet.headers, sheet.rows, mapping)
    const rows: PreviewRow[] = mappedData.map((mapped, i) => ({
      index: i,
      mapped,
      resolution: "use-existing",
    }))
    setPreviewRows(rows)
    setStep("preview")

    setChecking(true)
    const lookups = rows.map((r) => ({
      email: r.mapped["email"] || undefined,
      phone: r.mapped["phone"] || r.mapped["mobileNumber"] || undefined,
      name:  r.mapped["name"]  || undefined,
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

  // ── Step 4 (preview → next): Check leaders if applicable ──
  async function handlePreviewNext() {
    if (!onCheckLeaders) {
      await handleImport()
      return
    }

    setCheckingLeaders(true)
    const leaderRows = previewRows.map((r) => ({
      index:           r.index,
      groupName:       r.mapped["name"]            || undefined,
      leaderFirstName: r.mapped["leaderFirstName"] || undefined,
      leaderLastName:  r.mapped["leaderLastName"]  || undefined,
      leaderEmail:     r.mapped["leaderEmail"]     || undefined,
      leaderMobile:    r.mapped["leaderMobile"]    || undefined,
    }))
    const leaderResult = await onCheckLeaders(leaderRows)
    setCheckingLeaders(false)

    if (!leaderResult.success) {
      toast.error(leaderResult.error)
      return
    }

    if (leaderResult.data.length === 0) {
      // All leaders resolved — go straight to import
      await handleImport()
      return
    }

    setUnmatchedLeaderRows(leaderResult.data)
    setLeaderResolutions(new Map())
    setStep("leader-resolution")

    // Load members for the search combobox
    if (onLoadMembers && members.length === 0) {
      setMembersLoading(true)
      const membersResult = await onLoadMembers()
      setMembersLoading(false)
      if (membersResult.success) {
        setMembers(membersResult.data)
      }
    }
  }

  // ── Step 5: Run import ──
  async function handleImport() {
    setImporting(true)
    const payload = previewRows.map((row) => {
      const leaderRes = leaderResolutions.get(row.index)
      return {
        mapped:       row.mapped,
        resolution:   row.resolution,
        existingId:   row.duplicate?.kind === "recognized" ? undefined : row.duplicate?.existingId,
        existingType: row.duplicate?.kind === "recognized" ? undefined : row.duplicate?.existingType,
        leaderId:     leaderRes?.type === "link"   ? leaderRes.memberId    : undefined,
        createLeader: leaderRes?.type === "create" ? leaderRes             : undefined,
      }
    })
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
      prev.map((r) => r.duplicate && r.duplicate.kind !== "recognized" ? { ...r, resolution } : r)
    )
  }

  // ── Leader resolution ──
  function handleLeaderResolutionChange(rowIndexes: number[], resolution: LeaderResolution) {
    setLeaderResolutions((prev) => {
      const next = new Map(prev)
      for (const idx of rowIndexes) next.set(idx, resolution)
      return next
    })
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

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
      case "leader-resolution":
        return (
          <StepLeaderResolution
            rows={unmatchedLeaderRows}
            resolutions={leaderResolutions}
            members={members}
            membersLoading={membersLoading}
            onResolutionChange={handleLeaderResolutionChange}
          />
        )
      case "results":
        return result ? <StepResults result={result} /> : null
    }
  }

  function renderFooter() {
    switch (step) {
      case "upload":
        return null
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
            <Button variant="outline" onClick={() => setStep("column-map")} disabled={checkingLeaders || importing}>Back</Button>
            <Button onClick={handlePreviewNext} disabled={importing || checking || checkingLeaders}>
              {checkingLeaders ? "Checking leaders…" : importing ? "Importing…" : onCheckLeaders ? "Next" : `Import ${previewRows.length} row${previewRows.length !== 1 ? "s" : ""}`}
            </Button>
          </>
        )
      case "leader-resolution":
        return (
          <>
            <Button variant="outline" onClick={() => { setUnmatchedLeaderRows([]); setStep("preview") }} disabled={importing}>Back</Button>
            <Button onClick={handleImport} disabled={importing || !allLeadersResolved}>
              {importing ? "Importing…" : `Import ${previewRows.length} row${previewRows.length !== 1 ? "s" : ""}`}
            </Button>
          </>
        )
      case "results":
        return <Button onClick={() => handleOpenChange(false)}>Close</Button>
    }
  }

  function dialogWidth() {
    if (step === "preview" || step === "results" || step === "leader-resolution") return "sm:max-w-4xl"
    if (step === "column-map") return "sm:max-w-2xl"
    return "sm:max-w-lg"
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={dialogWidth()}>
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

        {/* Full-width indeterminate progress bar while checking leaders */}
        {checkingLeaders && (
          <div className="-mx-6 h-0.75 relative overflow-hidden bg-primary/15">
            <div
              className="absolute inset-y-0 bg-primary"
              style={{ animation: "indeterminate-1 2.1s cubic-bezier(0.65,0.815,0.735,0.395) infinite" }}
            />
            <div
              className="absolute inset-y-0 bg-primary"
              style={{ animation: "indeterminate-2 2.1s cubic-bezier(0.165,0.84,0.44,1) 1.15s infinite" }}
            />
          </div>
        )}

        <div className="py-2 min-w-0">{renderStep()}</div>

        {renderFooter() && (
          <DialogFooter>{renderFooter()}</DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
