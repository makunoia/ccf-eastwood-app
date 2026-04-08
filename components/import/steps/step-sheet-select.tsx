"use client"

import type { ParsedSheet } from "@/lib/import/types"

type Props = {
  sheets: ParsedSheet[]
  selected: number
  onSelect: (index: number) => void
}

export function StepSheetSelect({ sheets, selected, onSelect }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Multiple sheets detected. Select the sheet to import from.
      </p>
      <div className="flex flex-col gap-2">
        {sheets.map((sheet, i) => (
          <label
            key={i}
            className={[
              "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors",
              selected === i ? "border-primary bg-primary/5" : "hover:bg-muted/50",
            ].join(" ")}
          >
            <input
              type="radio"
              name="sheet"
              value={i}
              checked={selected === i}
              onChange={() => onSelect(i)}
              className="accent-primary"
            />
            <div>
              <p className="font-medium text-sm">{sheet.name}</p>
              <p className="text-xs text-muted-foreground">
                {sheet.headers.length} column{sheet.headers.length !== 1 ? "s" : ""},{" "}
                {sheet.rows.length} row{sheet.rows.length !== 1 ? "s" : ""}
              </p>
            </div>
          </label>
        ))}
      </div>
    </div>
  )
}
