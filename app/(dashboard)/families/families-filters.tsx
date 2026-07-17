"use client"

import { usePathname, useRouter } from "next/navigation"
import { FilterBar } from "@/components/filter-bar"

export function FamiliesFilters({ search }: { search: string }) {
  const router = useRouter()
  const pathname = usePathname()

  function setSearch(value: string) {
    const params = new URLSearchParams()
    if (value) params.set("search", value)
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname)
  }

  return (
    <FilterBar
      searchValue={search}
      searchPlaceholder="Search families..."
      onSearch={setSearch}
      activeCount={0}
      hasActive={Boolean(search)}
      onClear={() => router.replace(pathname)}
    />
  )
}
