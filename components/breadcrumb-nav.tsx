"use client"

import React from "react"
import Link from "next/link"
import { MoreHorizontal } from "lucide-react"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { layoutCrumbs, type BreadcrumbNavItem } from "@/lib/breadcrumbs"

/** Ancestor crumbs never eat the whole bar — the current page keeps the rest. */
const ANCESTOR_WIDTH = "max-w-[8rem] truncate lg:max-w-[14rem]"

function CrumbMenu({ items }: { items: BreadcrumbNavItem[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex shrink-0 items-center transition-colors hover:text-foreground">
        <MoreHorizontal className="size-4" />
        <span className="sr-only">Show parent pages</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-w-[70vw]">
        {items.map((item, index) => (
          <DropdownMenuItem key={`${item.href}-${index}`} asChild>
            <Link href={item.href} className="truncate">
              {item.label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function CrumbBar({
  items,
  variant,
  className,
}: {
  items: BreadcrumbNavItem[]
  variant: "mobile" | "desktop"
  className: string
}) {
  const layout = layoutCrumbs(items, variant)
  if (!layout) return null

  const { leading, hidden, current } = layout

  return (
    <Breadcrumb className={className}>
      <BreadcrumbList>
        {leading.map((item, index) => (
          <React.Fragment key={`${item.href}-${index}`}>
            {index > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href={item.href} className={ANCESTOR_WIDTH}>
                  {item.label}
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
          </React.Fragment>
        ))}
        {hidden.length > 0 && (
          <>
            {leading.length > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem>
              <CrumbMenu items={hidden} />
            </BreadcrumbItem>
          </>
        )}
        {(leading.length > 0 || hidden.length > 0) && <BreadcrumbSeparator />}
        <BreadcrumbItem>
          <BreadcrumbPage className="truncate">{current.label}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}

export function BreadcrumbNav({ items }: { items: BreadcrumbNavItem[] }) {
  if (items.length === 0) return null

  return (
    <>
      <CrumbBar items={items} variant="mobile" className="min-w-0 flex-1 sm:hidden" />
      <CrumbBar
        items={items}
        variant="desktop"
        className="hidden min-w-0 flex-1 sm:block"
      />
    </>
  )
}
