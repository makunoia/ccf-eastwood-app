"use client"

import * as React from "react"
import { IconFilter2, IconX } from "@tabler/icons-react"
import { useIsMobile } from "@/hooks/use-mobile"
import { SearchInput } from "@/components/search-input"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { Label } from "@/components/ui/label"

type FilterBarProps = {
  /** Current search value (from the URL). Omit `onSearch` to hide the search input. */
  searchValue?: string
  searchPlaceholder?: string
  onSearch?: (value: string) => void
  /** Number of active filters, excluding search. Shown on the Filters button. */
  activeCount: number
  /** Whether anything (search or filters) is active. Defaults to activeCount > 0. */
  hasActive?: boolean
  /** Clears search and all filters. */
  onClear?: () => void
  /** Filter controls, rendered inside the drawer. Wrap each in a FilterField. */
  children?: React.ReactNode
}

export function FilterBar({
  searchValue = "",
  searchPlaceholder = "Search...",
  onSearch,
  activeCount,
  hasActive,
  onClear,
  children,
}: FilterBarProps) {
  const isMobile = useIsMobile()
  const showClear = hasActive ?? activeCount > 0

  return (
    <div className="flex items-center gap-2">
      {onSearch && (
        <SearchInput
          key={searchValue}
          defaultValue={searchValue}
          placeholder={searchPlaceholder}
          onChange={onSearch}
          className="min-w-0 flex-1 sm:max-w-xs"
        />
      )}
      {children && (
        <Drawer direction={isMobile ? "bottom" : "right"}>
          <DrawerTrigger asChild>
            <Button variant="outline" className="shrink-0">
              <IconFilter2 className="size-4" />
              Filters
              {activeCount > 0 && (
                <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground tabular-nums">
                  {activeCount}
                </span>
              )}
            </Button>
          </DrawerTrigger>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Filters</DrawerTitle>
              <DrawerDescription>Results update as you choose.</DrawerDescription>
            </DrawerHeader>
            <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-4">
              {children}
            </div>
            <DrawerFooter>
              <DrawerClose asChild>
                <Button>Done</Button>
              </DrawerClose>
              {onClear && (
                <Button variant="outline" onClick={onClear} disabled={!showClear}>
                  Clear all
                </Button>
              )}
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      )}
      {showClear && onClear && (
        <Button variant="ghost" size="sm" className="shrink-0" onClick={onClear}>
          <IconX className="size-4" />
          <span className="sr-only sm:not-sr-only">Clear</span>
        </Button>
      )}
    </div>
  )
}

export function FilterField({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
