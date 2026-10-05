"use client"

import { startTransition, useId, useOptimistic } from "react"
import { usePathname, useRouter } from "next/navigation"
import { FilterBar, FilterField } from "@/components/filter-bar"
import { PersonCombobox } from "@/components/ui/person-combobox"
import { formatDayOfWeek } from "@/lib/format/schedule"
import { DGROUP_FILTER_KEYS, type DGroupFilters } from "@/lib/small-groups/list-filters"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type Option = { id: string; name: string }
type FilterDefinition = { key: Exclude<keyof DGroupFilters, "search">; label: string; all: string; options: Option[] }
const option = (id: string, name: string): Option => ({ id, name })

export function SmallGroupsFilters({
  lifeStages, filters, cities, languages, parentGroups, leaders,
}: {
  lifeStages: Option[]
  filters: DGroupFilters
  cities: string[]
  languages: string[]
  parentGroups: Option[]
  leaders: Option[]
}) {
  const leaderFilterId = useId()
  const router = useRouter()
  const pathname = usePathname()
  const [current, setOptimistic] = useOptimistic(filters)
  const activeCount = DGROUP_FILTER_KEYS.filter((key) => key !== "search" && Boolean(current[key])).length
  const definitions: FilterDefinition[] = [
    { key: "status", label: "Status", all: "All statuses", options: [option("Active", "Active"), option("Pending", "Pending"), option("Inactive", "Inactive")] },
    { key: "groupType", label: "Group type", all: "All types", options: [option("Regular", "Regular"), option("Couples", "Couples")] },
    { key: "lifeStageId", label: "Life stage", all: "All life stages", options: [...lifeStages, option("missing", "No life stage set")] },
    { key: "genderFocus", label: "Gender focus", all: "All genders", options: [option("Male", "Men"), option("Female", "Women"), option("Mixed", "Mixed")] },
    { key: "meetingFormat", label: "Meeting format", all: "All formats", options: [option("Online", "Online"), option("InPerson", "In person"), option("Hybrid", "Hybrid")] },
    { key: "day", label: "Meeting day", all: "Any day", options: [...Array.from({ length: 7 }, (_, day) => option(String(day), formatDayOfWeek(day))), option("missing", "Day not set")] },
    { key: "timeOfDay", label: "Meeting time", all: "Any time", options: [option("morning", "Morning (before 12 PM)"), option("afternoon", "Afternoon (12–6 PM)"), option("evening", "Evening (6 PM onwards)"), option("missing", "Time not set")] },
    { key: "city", label: "City", all: "All cities", options: cities.map((city) => option(city, city)) },
    { key: "language", label: "Language", all: "All languages", options: languages.map((language) => option(language, language)) },
    { key: "leader", label: "Leader", all: "All leaders", options: leaders },
    { key: "parent", label: "Parent DGroup", all: "All parent groups", options: [option("missing", "No parent group"), option("satellite", "Outside satellite"), ...parentGroups] },
  ]

  function update(next: DGroupFilters) {
    const params = new URLSearchParams()
    for (const key of DGROUP_FILTER_KEYS) if (next[key]) params.set(key, next[key])
    const qs = params.toString()
    startTransition(() => {
      setOptimistic(next)
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    })
  }

  return (
    <FilterBar
      searchValue={current.search}
      searchPlaceholder="Search groups or leaders..."
      onSearch={(search) => update({ ...current, search })}
      activeCount={activeCount}
      hasActive={Boolean(current.search) || activeCount > 0}
      onClear={() => update(Object.fromEntries(DGROUP_FILTER_KEYS.map((key) => [key, ""])) as DGroupFilters)}
    >
      {definitions.map(({ key, label, all, options }) => (
        <FilterField key={key} label={label} htmlFor={key === "leader" ? leaderFilterId : undefined}>
          {key === "leader" ? (
            <PersonCombobox
              id={leaderFilterId}
              options={options.map(({ id, name }) => ({ value: id, label: name }))}
              value={current.leader}
              onValueChange={(leader) => update({ ...current, leader })}
              placeholder="All leaders"
              searchPlaceholder="Search leaders..."
              emptyText="No leaders found."
              clearable
              clearLabel="All leaders"
            />
          ) : (
            <Select value={current[key] || "all"} onValueChange={(value) => update({ ...current, [key]: value === "all" ? "" : value })}>
              <SelectTrigger className="w-full" aria-label={label}>
                <SelectValue placeholder={all} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{all}</SelectItem>
                {options.map(({ id, name }) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </FilterField>
      ))}
    </FilterBar>
  )
}
