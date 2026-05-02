"use client"

import * as React from "react"
import { IconSearch, IconX } from "@tabler/icons-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type SearchInputProps = {
  defaultValue?: string
  placeholder?: string
  onChange: (value: string) => void
  className?: string
}

export function SearchInput({
  defaultValue = "",
  placeholder = "Search...",
  onChange,
  className,
}: SearchInputProps) {
  const [value, setValue] = React.useState(defaultValue)

  function clear() {
    setValue("")
    onChange("")
  }

  return (
    <form
      className={cn("relative flex-1", className)}
      onSubmit={(e) => { e.preventDefault(); onChange(value) }}
    >
      <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className={cn("pl-8", value ? "pr-16" : "pr-3")}
      />
      {value && (
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center">
          <button
            type="button"
            onClick={clear}
            className="p-1 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <IconX className="size-3.5" />
          </button>
          <button
            type="submit"
            className="p-1 text-muted-foreground hover:text-foreground"
            aria-label="Search"
          >
            <IconSearch className="size-3.5" />
          </button>
        </div>
      )}
    </form>
  )
}
