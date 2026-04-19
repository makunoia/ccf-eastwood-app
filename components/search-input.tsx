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
  const onChangeFn = React.useRef(onChange)
  React.useLayoutEffect(() => {
    onChangeFn.current = onChange
  })

  React.useEffect(() => {
    const timer = setTimeout(() => {
      onChangeFn.current(value)
    }, 300)
    return () => clearTimeout(timer)
  }, [value])

  return (
    <div className={cn("relative flex-1", className)}>
      <IconSearch className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="pl-8 pr-8"
      />
      {value && (
        <button
          type="button"
          onClick={() => setValue("")}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <IconX className="size-4" />
        </button>
      )}
    </div>
  )
}
