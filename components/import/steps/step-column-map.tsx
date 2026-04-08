"use client"

import type { FieldDefinition, ColumnMapping } from "@/lib/import/types"

type Props = {
  fields: FieldDefinition[]
  headers: string[]
  mapping: ColumnMapping
  onChange: (mapping: ColumnMapping) => void
  errors: Record<string, string>
}

export function StepColumnMap({ fields, headers, mapping, onChange, errors }: Props) {
  function set(fieldKey: string, header: string) {
    onChange({ ...mapping, [fieldKey]: header })
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm text-muted-foreground mb-3">
        Match each data field to the corresponding column in your file. Required fields are marked with{" "}
        <span className="text-destructive">*</span>.
      </p>
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="px-4 py-2 text-left font-medium w-1/2">Data field</th>
              <th className="px-4 py-2 text-left font-medium w-1/2">Column in file</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field) => (
              <tr key={field.key} className="border-b last:border-0">
                <td className="px-4 py-2.5">
                  <div className="font-medium">
                    {field.label}
                    {field.required && <span className="text-destructive ml-0.5">*</span>}
                  </div>
                  {field.hint && (
                    <div className="text-xs text-muted-foreground">{field.hint}</div>
                  )}
                  {errors[field.key] && (
                    <div className="text-xs text-destructive mt-0.5">{errors[field.key]}</div>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <select
                    value={mapping[field.key] ?? ""}
                    onChange={(e) => set(field.key, e.target.value)}
                    className={[
                      "w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring",
                      errors[field.key] ? "border-destructive" : "border-input",
                    ].join(" ")}
                  >
                    <option value="">— not mapped —</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
