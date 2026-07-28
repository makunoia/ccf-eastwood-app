"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import {
  IconArrowLeft,
  IconCalendarStar,
  IconForms,
  IconLayoutDashboard,
  IconSettings,
  IconUserCheck,
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

type ClusterSidebarProps = React.ComponentProps<typeof Sidebar> & {
  clusterId: string
  clusterName: string
  showBackLink: boolean
  logoUrl?: string | null
}

export function ClusterSidebar({
  clusterId,
  clusterName,
  showBackLink,
  logoUrl,
  ...props
}: ClusterSidebarProps) {
  const pathname = usePathname()
  const base = `/cluster/${clusterId}`

  function isActive(path: string) {
    return pathname === path || pathname.startsWith(path + "/")
  }

  const navItems = [
    { title: "Dashboard", url: `${base}/dashboard`, icon: IconLayoutDashboard },
    { title: "Registrants", url: `${base}/registrants`, icon: IconUsers },
    { title: "Check-in", url: `${base}/checkin`, icon: IconUserCheck },
    { title: "Forms", url: `${base}/forms`, icon: IconForms },
  ]

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <Link href={base} className="flex flex-col items-center gap-1.5 py-4">
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt={clusterName}
              width={64}
              height={64}
              className="rounded-lg object-contain"
            />
          ) : (
            <div className="size-16 rounded-lg bg-muted flex items-center justify-center">
              <IconCalendarStar className="size-8 text-muted-foreground" />
            </div>
          )}
          <span className="text-sm font-semibold text-center leading-snug line-clamp-2 px-2">
            {clusterName}
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
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
              <SidebarMenuButton asChild tooltip="Back to Event Clusters">
                <Link href="/events/clusters">
                  <IconArrowLeft />
                  <span>Event Clusters</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
