import "server-only"

export type WorkbookTable = { sheet: string; headerRow: number; headers: string[]; rowCount: number; sampleRows: string[][] }
export type WorkbookProposal = { sourceSheet: string; sourceRow: number; kind: string; status: "Proposed" | "NeedsReview"; proposedData: Record<string, string> }

function cell(value: unknown): string {
  if (value == null) return ""
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).trim()
}

const HEADER_WORDS = new Set(["leader", "contact number", "schedule", "final status", "group leader", "member", "group type", "review area", "issue", "suggested action", "name", "action", "reason"])

/** Scores the first ten rows so report titles do not beat the actual header row. */
function findHeaderRow(rows: unknown[][]): number {
  const candidates = rows.slice(0, 10).map((row, index) => {
    const values = row.map(cell).filter(Boolean)
    const known = values.filter((value) => HEADER_WORDS.has(value.toLowerCase())).length
    return { index, score: known * 100 + values.length }
  })
  return candidates.sort((left, right) => right.score - left.score || left.index - right.index)[0]?.index ?? 0
}

export async function inspectWorkbook(buffer: ArrayBuffer): Promise<WorkbookTable[]> {
  const XLSX = await import("xlsx")
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true })
  return workbook.SheetNames.map((sheet) => {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheet], { header: 1, defval: "" }) as unknown[][]
    const headerIndex = findHeaderRow(rows)
    const headers = (rows[headerIndex] ?? []).map(cell)
    const dataRows = rows.slice(headerIndex + 1).map((row) => row.map(cell)).filter((row) => row.some(Boolean))
    return { sheet, headerRow: headerIndex + 1, headers, rowCount: dataRows.length, sampleRows: dataRows.slice(0, 3) }
  })
}

/**
 * Extracts only the known DGroup consolidation tables. It deliberately leaves
 * roster and external-action rows in review: names alone never identify people.
 */
export async function extractDGroupWorkbookProposals(buffer: ArrayBuffer): Promise<WorkbookProposal[]> {
  const XLSX = await import("xlsx")
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true })
  const proposals: WorkbookProposal[] = []
  for (const sheet of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheet], { header: 1, defval: "" }) as unknown[][]
    const headerIndex = findHeaderRow(rows)
    const headers = (rows[headerIndex] ?? []).map(cell)
    const index = (header: string) => headers.findIndex((value) => value.trim().toLowerCase() === header.toLowerCase())
    const valueAt = (row: unknown[], header: string) => {
      const column = index(header)
      return column < 0 ? "" : cell(row[column])
    }
    rows.slice(headerIndex + 1).forEach((row, offset) => {
      if (!row.some((value) => cell(value))) return
      const sourceRow = headerIndex + offset + 2
      if (sheet === "Final DLeaders") {
        const leader = valueAt(row, "Leader")
        if (!leader) return
        proposals.push({ sourceSheet: sheet, sourceRow, kind: "dgroup_leader_metadata", status: "Proposed", proposedData: {
          leader, phone: valueAt(row, "Contact number"), groupType: valueAt(row, "Dgroup type"), schedule: valueAt(row, "Schedule"), sourceStatus: valueAt(row, "Final status"),
        } })
      } else if (sheet === "Group Membership") {
        proposals.push({ sourceSheet: sheet, sourceRow, kind: "roster_membership", status: "NeedsReview", proposedData: { leader: valueAt(row, "Group leader"), member: valueAt(row, "Member"), groupType: valueAt(row, "Group type") } })
      } else if (sheet === "Review Needed") {
        proposals.push({ sourceSheet: sheet, sourceRow, kind: "review_item", status: "NeedsReview", proposedData: { area: valueAt(row, "Review area"), leader: valueAt(row, "Leader"), issue: valueAt(row, "Issue"), suggestedAction: valueAt(row, "Suggested action") } })
      } else if (sheet === "Archive Actions") {
        proposals.push({ sourceSheet: sheet, sourceRow, kind: "external_action", status: "NeedsReview", proposedData: { name: valueAt(row, "Name"), action: valueAt(row, "Action"), reason: valueAt(row, "Reason") } })
      }
    })
  }
  return proposals
}
