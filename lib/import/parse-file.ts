// Client-only — do NOT add "use server"
import type { ParsedFile, ParsedSheet } from "./types"

function pad2(value: number): string {
  return String(value).padStart(2, "0")
}

function formatSpreadsheetDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function formatSpreadsheetTime(date: Date): string {
  const hours = pad2(date.getHours())
  const minutes = pad2(date.getMinutes())
  const seconds = date.getSeconds()

  if (seconds === 0) return `${hours}:${minutes}`

  return `${hours}:${minutes}:${pad2(seconds)}`
}

function normalizeCell(val: unknown): string {
  if (val === null || val === undefined) return ""
  if (val instanceof Date) {
    const datePart = formatSpreadsheetDate(val)
    const hasTime =
      val.getHours() !== 0 ||
      val.getMinutes() !== 0 ||
      val.getSeconds() !== 0 ||
      val.getMilliseconds() !== 0

    return hasTime ? `${datePart} ${formatSpreadsheetTime(val)}` : datePart
  }
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
