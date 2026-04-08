// Client-only — do NOT add "use server"
import type { ParsedFile, ParsedSheet } from "./types"

function normalizeCell(val: unknown): string {
  if (val === null || val === undefined) return ""
  if (val instanceof Date) return val.toISOString().split("T")[0]
  return String(val).trim()
}

export async function parseFile(file: File): Promise<ParsedFile> {
  const XLSX = await import("xlsx")
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true })

  const sheets: ParsedSheet[] = workbook.SheetNames.map((name) => {
    const ws = workbook.Sheets[name]
    // header:1 returns raw arrays; defval:"" fills empty cells
    const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" })

    if (raw.length === 0) {
      return { name, headers: [], rows: [] }
    }

    const headers = (raw[0] as unknown[]).map(normalizeCell)
    const rows = raw.slice(1).map((row) => (row as unknown[]).map(normalizeCell))

    // Drop completely empty rows
    const nonEmpty = rows.filter((row) => row.some((cell) => cell !== ""))

    return { name, headers, rows: nonEmpty }
  })

  return { fileName: file.name, sheets }
}
