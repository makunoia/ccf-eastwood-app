"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  IconArrowLeft,
  IconBus,
  IconCalendarWeek,
  IconCalendarEvent,
  IconCross,
  IconLayoutDashboard,
  IconSettings,
  IconUsersGroup,
  IconHeart,
  IconUsers,
} from "@tabler/icons-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

type EventSidebarProps = React.ComponentProps<typeof Sidebar> & {
  eventId: string
  eventName: string
  eventType: "OneTime" | "MultiDay" | "Recurring"
  modules: string[]
  showBackLink: boolean
}

export function EventSidebar({
  eventId,
  eventName,
  eventType,
  modules,
  showBackLink,
  ...props
}: EventSidebarProps) {
  const pathname = usePathname()
  const base = `/event/${eventId}`

  function isActive(path: string) {
    return pathname === path || pathname.startsWith(path + "/")
  }

  const navItems = [
    {
      title: "Dashboard",
      url: `${base}/dashboard`,
      icon: IconLayoutDashboard,
      show: true,
    },
    {
      title: "Registrants",
      url: `${base}/registrants`,
      icon: IconUsers,
      show: true,
    },
    {
      title: "Sessions",
      url: `${base}/sessions`,
      icon: IconCalendarWeek,
      show: eventType === "Recurring",
    },
    {
      title: "Days",
      url: `${base}/sessions`,
      icon: IconCalendarEvent,
      show: eventType === "MultiDay",
    },
    {
      title: "Breakout Groups",
      url: `${base}/breakouts`,
      icon: IconUsersGroup,
      show: true,
    },
    {
      title: "Volunteers",
      url: `${base}/volunteers`,
      icon: IconHeart,
      show: true,
    },
    {
      title: "Baptism",
      url: `${base}/baptism`,
      icon: IconCross,
      show: modules.includes("Baptism"),
    },
    {
      title: "Embarkation",
      url: `${base}/embarkation`,
      icon: IconBus,
      show: modules.includes("Embarkation"),
    },
  ]

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:p-1.5! h-auto"
            >
              <span className="flex flex-col items-start gap-0">
                <span className="text-sm font-semibold leading-snug line-clamp-2">
                  {eventName}
                </span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems
                .filter((item) => item.show)
                .map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      tooltip={item.title}
                      isActive={isActive(item.url)}
                    >
                      <Link href={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="Settings"
              isActive={isActive(`${base}/settings`)}
            >
              <Link href={`${base}/settings`}>
                <IconSettings />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {showBackLink && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Back to Events">
                <Link href="/events">
                  <IconArrowLeft />
                  <span>Events</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
