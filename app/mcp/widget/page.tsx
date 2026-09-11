"use client"

import { useState } from "react"
import { IconFileSpreadsheet, IconUpload } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function McpImportWidget() {
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const batchId = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("batchId")

  async function upload() {
    if (!file || !batchId) return
    setBusy(true); setStatus(null)
    const form = new FormData(); form.set("file", file)
    const response = await fetch(`/api/mcp/imports/${batchId}/upload`, { method: "POST", body: form })
    const payload = await response.json() as { error?: string; proposalCount?: number }
    setStatus(response.ok ? `Workbook staged. ${payload.proposalCount ?? 0} rows are ready for the ChatGPT review.` : payload.error ?? "Upload failed.")
    setBusy(false)
  }

  return <main className="min-h-svh bg-muted/30 p-4"><Card className="mx-auto max-w-lg">
    <CardHeader><CardTitle className="flex items-center gap-2"><IconFileSpreadsheet className="size-5" />DGroup workbook</CardTitle><CardDescription>Upload the workbook created for this ChatGPT import batch.</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      {!batchId ? <p className="text-sm text-destructive">Start an import from ChatGPT before opening this widget.</p> : <>
        <input aria-label="DGroup workbook" type="file" accept=".xlsx,.xls,.csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="block w-full text-sm" />
        <Button onClick={upload} disabled={!file || busy}><IconUpload className="size-4" />{busy ? "Uploading…" : "Upload workbook"}</Button>
      </>}
      {status && <p className="text-sm text-muted-foreground" role="status">{status}</p>}
    </CardContent>
  </Card></main>
}
