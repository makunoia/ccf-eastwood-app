"use client"

import * as React from "react"
import { CheckIcon, ChevronDownIcon, SearchIcon, XIcon } from "lucide-react"
import { Popover as PopoverPrimitive } from "radix-ui"
import { cn } from "@/lib/utils"

export type PersonComboboxOption = {
  value: string
  label: string
  hint?: string
}

type PersonComboboxProps = {
  options: PersonComboboxOption[]
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  clearable?: boolean
  clearLabel?: string
  disabled?: boolean
  id?: string
  className?: string
}

export function PersonCombobox({
  options,
  value,
  onValueChange,
  placeholder = "Select person",
  searchPlaceholder = "Search by name…",
  emptyText = "No results found.",
  clearable = false,
  clearLabel = "None",
  disabled = false,
  id,
  className,
}: PersonComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const inputRef = React.useRef<HTMLInputElement>(null)

  const selected = options.find((o) => o.value === value)

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, query])

  function handleSelect(optionValue: string) {
    onValueChange(optionValue)
    setOpen(false)
    setQuery("")
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) setQuery("")
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <PopoverPrimitive.Trigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-base whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
            className
          )}
        >
          <span className={cn("truncate text-left", !selected && "text-muted-foreground")}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          className="z-50 w-[var(--radix-popover-trigger-width)] rounded-md border bg-popover text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            inputRef.current?.focus()
          }}
        >
          <div className="flex items-center border-b px-2">
            <SearchIcon className="mr-1.5 size-3.5 shrink-0 opacity-50" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="flex h-9 w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="ml-1.5 opacity-50 hover:opacity-100"
              >
                <XIcon className="size-3.5" />
              </button>
            )}
          </div>

          <div className="max-h-60 overflow-y-auto p-1">
            {clearable && (
              <button
                type="button"
                onClick={() => handleSelect("")}
                className={cn(
                  "relative flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                  !value && "bg-accent/50"
                )}
              >
                <span className="truncate text-muted-foreground">{clearLabel}</span>
                {!value && <CheckIcon className="ml-auto size-3.5 shrink-0" />}
              </button>
            )}

            {filtered.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">{emptyText}</p>
            ) : (
              filtered.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleSelect(option.value)}
                  className={cn(
                    "relative flex w-full cursor-default items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                    value === option.value && "bg-accent/50"
                  )}
                >
                  <span className="truncate">{option.label}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {option.hint && (
                      <span className="text-xs text-muted-foreground">{option.hint}</span>
                    )}
                    {value === option.value && <CheckIcon className="size-3.5" />}
                  </span>
                </button>
              ))
            )}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
