"use client"

import * as React from "react"
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { restrictToVerticalAxis } from "@dnd-kit/modifiers"
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { IconGripVertical, IconLayoutColumns, IconLock } from "@tabler/icons-react"

import { useIsMobile } from "@/hooks/use-mobile"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"
import {
  changedColumnCount,
  resolveTableColumns,
  toggleColumn,
  type ResolvedTableColumn,
  type TableColumnSpec,
  type TableDensityValue,
  type TablePreference,
} from "@/lib/tables/preferences"

/**
 * The column picker every table carries.
 *
 * Built as a Drawer — bottom on mobile, right on desktop — deliberately
 * matching `FilterBar` rather than the centred Export dialog. Choosing which
 * columns to see is the sibling of choosing which rows to see; both are ways of
 * narrowing the same list, and they should feel like the same control. The
 * export dialog is a different thing: a one-shot decision attached to a
 * download, not a standing view setting.
 *
 * The list is flat rather than grouped by section (which is how the export
 * picker organises itself) because order is editable here, and dragging a row
 * between two groups has no meaning to define.
 */
export function TableColumnsDrawer({
  specs,
  preference,
  onChange,
  onReset,
}: {
  specs: TableColumnSpec[]
  preference: TablePreference
  onChange: (preference: TablePreference) => void
  onReset: () => void
}) {
  const isMobile = useIsMobile()
  const layout = resolveTableColumns(specs, preference)
  const changed = changedColumnCount(specs, preference)

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  )

  // Rows the admin can drag: everything not locked and not a hidden opt-in.
  // A hidden opt-in has no position to speak of, so it lives in "More columns"
  // below and joins the list the moment it is switched on.
  // Structural columns are dropped here rather than in `resolveTableColumns`:
  // they still take part in ordering and visibility, they just aren't choices.
  const listed = layout.columns.filter((c) => !c.structural)
  const sortable = listed.filter((c) => !c.locked && (c.visible || !c.optIn))
  const availableOptIns = listed.filter((c) => c.optIn && !c.visible)
  const lockedColumns = listed.filter((c) => c.locked)
  const visibleCount = listed.filter((c) => c.visible).length

  function handleToggle(column: ResolvedTableColumn, visible: boolean) {
    let next = toggleColumn(column, visible, preference)
    // Switching an opt-in column on gives it a position for the first time.
    if (visible && column.optIn && !next.order.includes(column.id)) {
      next = { ...next, order: [...currentOrder(), column.id] }
    }
    onChange(next)
  }

  function currentOrder(): string[] {
    return layout.columns.filter((c) => !c.locked).map((c) => c.id)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const ids = sortable.map((c) => c.id)
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from === -1 || to === -1) return

    const reordered = arrayMove(ids, from, to)
    // Hidden opt-ins keep their stored positions; only the visible sequence moved.
    const rest = currentOrder().filter((id) => !ids.includes(id))
    onChange({ ...preference, order: [...reordered, ...rest] })
  }

  function handleDensity(density: string) {
    if (density !== "Compact" && density !== "Comfortable") return
    onChange({ ...preference, density: density as TableDensityValue })
  }

  return (
    <Drawer direction={isMobile ? "bottom" : "right"}>
      <DrawerTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0">
          <IconLayoutColumns className="size-4" />
          <span className="hidden sm:inline">Columns</span>
          {changed > 0 && (
            <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground tabular-nums">
              {changed}
            </span>
          )}
        </Button>
      </DrawerTrigger>

      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Columns</DrawerTitle>
          <DrawerDescription>
            Choose what this table shows and drag to reorder. Saved to your account.
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col gap-5 overflow-y-auto px-4 pb-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-muted-foreground">Row height</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              value={layout.density}
              onValueChange={handleDensity}
              className="w-full"
            >
              <ToggleGroupItem value="Comfortable" className="flex-1">
                Comfortable
              </ToggleGroupItem>
              <ToggleGroupItem value="Compact" className="flex-1">
                Compact
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="flex items-center justify-between gap-2 text-sm">
            <p className="text-muted-foreground">
              {visibleCount} of {listed.length} columns shown
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              disabled={changed === 0 && layout.density === "Comfortable"}
            >
              Reset
            </Button>
          </div>

          <div className="flex flex-col gap-1">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis]}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={sortable.map((c) => c.id)}
                strategy={verticalListSortingStrategy}
              >
                {sortable.map((column) => (
                  <SortableColumnRow
                    key={column.id}
                    column={column}
                    onToggle={(visible) => handleToggle(column, visible)}
                  />
                ))}
              </SortableContext>
            </DndContext>

            {lockedColumns.map((column) => (
              <div
                key={column.id}
                className="flex items-center gap-2.5 rounded-md px-1 py-1.5 text-sm text-muted-foreground"
              >
                <IconLock className="size-4 shrink-0 opacity-50" />
                <span className="flex-1">{column.label}</span>
                <span className="text-xs">Always shown</span>
              </div>
            ))}
          </div>

          {availableOptIns.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="type-label text-muted-foreground">More columns</h4>
              <p className="text-xs text-muted-foreground">
                Fields these records hold that this table doesn&apos;t show by default.
              </p>
              <div className="flex flex-col gap-1">
                {availableOptIns.map((column) => (
                  <label
                    key={column.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1.5 text-sm hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={false}
                      onCheckedChange={() => handleToggle(column, true)}
                      aria-label={`Show ${column.label}`}
                    />
                    <span className="flex-1">{column.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <DrawerFooter>
          <DrawerClose asChild>
            <Button>Done</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

function SortableColumnRow({
  column,
  onToggle,
}: {
  column: ResolvedTableColumn
  onToggle: (visible: boolean) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: column.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-1 rounded-md bg-background",
        isDragging && "relative z-10 opacity-80 shadow-sm",
      )}
    >
      <button
        type="button"
        className="cursor-grab rounded-sm p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <IconGripVertical className="size-4" />
        <span className="sr-only">Reorder {column.label}</span>
      </button>
      <label className="flex flex-1 cursor-pointer items-center gap-2.5 rounded-md px-1 py-1.5 text-sm hover:bg-muted/50">
        <Checkbox
          checked={column.visible}
          onCheckedChange={(checked) => onToggle(checked === true)}
          aria-label={column.label}
        />
        <span className="flex-1">{column.label}</span>
      </label>
    </div>
  )
}
