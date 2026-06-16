"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import {
  IconArrowLeft,
  IconBus,
  IconCalendarWeek,
  IconCalendarEvent,
  IconCross,
  IconFish,
  IconLayoutDashboard,
  IconLogout,
  IconSettings,
  IconUsersGroup,
  IconHeart,
  IconUsers,
  IconCalendar,
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
  showLogout?: boolean
  logoUrl?: string | null
}

export function EventSidebar({
  eventId,
  eventName,
  eventType,
  modules,
  showBackLink,
  showLogout,
  logoUrl,
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
    {
      title: "Catch Mech",
      url: `${base}/catch-mech`,
      icon: IconFish,
      show: modules.includes("CatchMech"),
    },
  ]

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <Link href={base} className="flex flex-col items-center gap-1.5 py-4">
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt={eventName}
              width={64}
              height={64}
              className="rounded-lg object-contain"
            />
          ) : (
            <div className="size-16 rounded-lg bg-muted flex items-center justify-center">
              <IconCalendar className="size-8 text-muted-foreground" />
            </div>
          )}
          <span className="text-sm font-semibold text-center leading-snug line-clamp-2 px-2">
            {eventName}
          </span>
        </Link>
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
          {showLogout && (
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Log out"
                onClick={() => signOut({ callbackUrl: "/login" })}
              >
                <IconLogout />
                <span>Log out</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
