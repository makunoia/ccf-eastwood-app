"use client"

import * as React from "react"
import Image from "next/image"
import { IconPhoto, IconTrash, IconUpload } from "@tabler/icons-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

type Props = {
  value: string | null
  onChange: (url: string | null) => void
  label?: string
}

export function LogoUploader({ value, onChange, label = "Logo" }: Props) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = React.useState(false)

  async function handleFile(file: File) {
    setUploading(true)
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, contentType: file.type, size: file.size }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? "Upload failed")
      }
      const { uploadUrl, publicUrl } = await res.json()

      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      })
      if (!put.ok) throw new Error("Upload to storage failed")

      onChange(publicUrl)
      toast.success("Logo uploaded")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>

      {value ? (
        <div className="flex items-center gap-4">
          <div className="relative size-20 rounded-lg border bg-muted overflow-hidden">
            <Image src={value} alt="Logo preview" fill className="object-contain p-1" />
          </div>
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              <IconUpload className="mr-1.5 size-3.5" />
              {uploading ? "Uploading…" : "Replace"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => onChange(null)}
              disabled={uploading}
            >
              <IconTrash className="mr-1.5 size-3.5" />
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <div
          className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed bg-muted/40 p-6 text-center cursor-pointer hover:bg-muted/60 transition-colors"
          onClick={() => inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <IconPhoto className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {uploading ? "Uploading…" : "Click or drag to upload"}
          </p>
          <p className="text-xs text-muted-foreground">PNG, JPG, WEBP up to 5 MB</p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ""
        }}
      />
    </div>
  )
}
