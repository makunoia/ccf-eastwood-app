// Client-only — uses Blob / URL.createObjectURL
"use client"

export type CSVCell = string | number | boolean | null | undefined

function escapeCell(cell: CSVCell): string {
  if (cell === null || cell === undefined) return ""
  const s = String(cell)
  // Wrap in quotes if it contains comma, quote, newline, or leading/trailing whitespace
  if (/[",\r\n]/.test(s) || s !== s.trim()) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function toCSV(headers: string[], rows: CSVCell[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(","))
  return lines.join("\r\n")
}

export function downloadCSV(filename: string, headers: string[], rows: CSVCell[][]): void {
  const csv = toCSV(headers, rows)
  // Prepend UTF-8 BOM so Excel reads accents/unicode correctly
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

export function formatDayOfWeek(day: number | null | undefined): string {
  if (day === null || day === undefined) return ""
  return DAY_NAMES[day] ?? ""
}
