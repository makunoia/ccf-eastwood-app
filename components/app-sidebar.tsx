"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import {
  IconBuilding,
  IconCalendar,
  IconHeart,
  IconHelp,
  IconLayoutDashboard,
  IconSettings,
  IconUserScan,
  IconUsers,
  IconUsersGroup,
  type Icon,
} from "@tabler/icons-react"
import type { FeatureArea } from "@/app/generated/prisma/client"

import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar"

type NavItem = { title: string; url: string; icon: Icon; feature?: FeatureArea }

const navMain: NavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: IconLayoutDashboard },
  { title: "Guests", url: "/guests", icon: IconUserScan, feature: "Guests" },
  { title: "Members", url: "/members", icon: IconUsers, feature: "Members" },
  { title: "Small Groups", url: "/small-groups", icon: IconUsersGroup, feature: "SmallGroups" },
  { title: "Ministries", url: "/ministries", icon: IconBuilding, feature: "Ministries" },
  { title: "Events", url: "/events", icon: IconCalendar, feature: "Events" },
  { title: "Volunteers", url: "/volunteers", icon: IconHeart, feature: "Volunteers" },
]

const navSecondary: { title: string; url: string; icon: Icon }[] = [
  { title: "Settings", url: "/settings", icon: IconSettings },
  { title: "Help", url: "#", icon: IconHelp },
]

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  user: {
    name: string
    email: string
    avatar: string
  }
  role?: string
  permissions?: FeatureArea[]
}

export function AppSidebar({ user, role, permissions, ...props }: AppSidebarProps) {
  const isSuperAdmin = role === "SuperAdmin"

  // Filter items and strip the internal `feature` field before passing to NavMain
  const filteredNav = navMain
    .filter((item) => {
      if (!item.feature) return true // Dashboard always visible
      if (isSuperAdmin) return true
      return (permissions ?? []).includes(item.feature)
    })
    .map(({ feature: _f, ...rest }) => rest)

  // Staff cannot access Settings
  const filteredSecondary = isSuperAdmin
    ? navSecondary
    : navSecondary.filter((item) => item.url !== "/settings")

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <Link href="/" className="flex flex-col items-center gap-1.5 py-4">
          <Image src="/ccf-logo.png" alt="CCF Eastwood" width={64} height={64} />
          <span className="text-sm font-semibold">CCF Eastwood Admin</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={filteredNav} />
        <NavSecondary items={filteredSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}
