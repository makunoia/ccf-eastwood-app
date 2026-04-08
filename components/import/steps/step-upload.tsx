"use client"

import * as React from "react"
import { IconUpload, IconFileSpreadsheet } from "@tabler/icons-react"

type Props = {
  onFileParsed: (file: File) => void
  loading: boolean
}

export function StepUpload({ onFileParsed, loading }: Props) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  function validateAndLoad(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase()
    if (ext !== "csv" && ext !== "xlsx" && ext !== "xls") {
      setError("Only .csv, .xlsx, and .xls files are supported.")
      return
    }
    setError(null)
    onFileParsed(file)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) validateAndLoad(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) validateAndLoad(file)
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        className={[
          "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors cursor-pointer",
          dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50",
          loading ? "pointer-events-none opacity-60" : "",
        ].join(" ")}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          {loading ? (
            <IconFileSpreadsheet className="size-6 text-muted-foreground animate-pulse" />
          ) : (
            <IconUpload className="size-6 text-muted-foreground" />
          )}
        </div>
        <div>
          <p className="font-medium text-sm">
            {loading ? "Parsing file…" : "Drop your file here, or click to browse"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Supports .csv, .xlsx, .xls</p>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  )
}
