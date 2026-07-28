"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { SettingCard } from "@/components/ui/setting-card"
import { LogoUploader } from "@/components/logo-uploader"
import { updateEventCluster } from "@/app/(dashboard)/events/cluster-actions"

/**
 * Shared-form governance for a cluster — the same surface the per-event
 * EventRegistration Forms page presents (Public access card + theme fields),
 * except everything writes to the EventCluster record.
 */

type PageState = {
  registrationPageTitle: string
  registrationPageDescription: string
  registrationPageBannerUrl: string
  logoUrl: string
  themeColorPrimary: string
}

function toDatetimeInput(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function ClusterFormSettings({
  clusterId,
  clusterName,
  publicPath,
  initialIsOpen,
  initialRegistrationStart,
  initialRegistrationEnd,
  initialPage,
}: {
  clusterId: string
  clusterName: string
  publicPath: string
  initialIsOpen: boolean
  initialRegistrationStart: string | null
  initialRegistrationEnd: string | null
  initialPage: PageState
}) {
  const router = useRouter()

  const [isOpen, setIsOpen] = React.useState(initialIsOpen)
  const [toggling, setToggling] = React.useState(false)

  const [regStart, setRegStart] = React.useState(toDatetimeInput(initialRegistrationStart))
  const [regEnd, setRegEnd] = React.useState(toDatetimeInput(initialRegistrationEnd))
  const [windowDirty, setWindowDirty] = React.useState(false)
  const [savingWindow, setSavingWindow] = React.useState(false)

  const [page, setPage] = React.useState<PageState>(initialPage)
  const [pageDirty, setPageDirty] = React.useState(false)
  const [savingPage, setSavingPage] = React.useState(false)

  function setPageField<K extends keyof PageState>(key: K, value: PageState[K]) {
    setPageDirty(true)
    setPage((prev) => ({ ...prev, [key]: value }))
  }

  async function handleToggleOpen() {
    const next = !isOpen
    setToggling(true)
    const result = await updateEventCluster(clusterId, { isOpen: next })
    setToggling(false)
    if (result.success) {
      setIsOpen(next)
      toast.success(next ? "Form opened" : "Form closed")
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  async function handleSaveWindow() {
    setSavingWindow(true)
    const result = await updateEventCluster(clusterId, {
      registrationStart: regStart ? new Date(regStart) : null,
      registrationEnd: regEnd ? new Date(regEnd) : null,
    })
    setSavingWindow(false)
    if (result.success) {
      setWindowDirty(false)
      toast.success("Registration window saved")
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  async function handleSavePage() {
    setSavingPage(true)
    const result = await updateEventCluster(clusterId, {
      registrationPageTitle: page.registrationPageTitle || null,
      registrationPageDescription: page.registrationPageDescription || null,
      registrationPageBannerUrl: page.registrationPageBannerUrl || null,
      logoUrl: page.logoUrl || null,
      themeColorPrimary: page.themeColorPrimary || null,
    })
    setSavingPage(false)
    if (result.success) {
      setPageDirty(false)
      toast.success("Page settings saved")
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      {/* Public access — standard Forms-page card */}
      <SettingCard
        title="Public access"
        description={
          isOpen
            ? "This form is open — anyone with the link can use it."
            : "This form is closed — visitors see an unavailable message."
        }
        control={
          <Switch checked={isOpen} onCheckedChange={handleToggleOpen} disabled={toggling} />
        }
      >
        <a
          href={publicPath}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
        >
          View public form
        </a>
      </SettingCard>

      {/* Registration window */}
      <SettingCard
        title="Registration window"
        description="When the shared form accepts registrations. Leave blank for no limit — each event's own window still applies inside."
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cluster-reg-start">Opens</Label>
              <Input
                id="cluster-reg-start"
                type="datetime-local"
                value={regStart}
                onChange={(e) => {
                  setWindowDirty(true)
                  setRegStart(e.target.value)
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cluster-reg-end">Closes</Label>
              <Input
                id="cluster-reg-end"
                type="datetime-local"
                value={regEnd}
                onChange={(e) => {
                  setWindowDirty(true)
                  setRegEnd(e.target.value)
                }}
              />
            </div>
          </div>
          {windowDirty && (
            <Button onClick={handleSaveWindow} disabled={savingWindow}>
              {savingWindow ? "Saving…" : "Save window"}
            </Button>
          )}
        </div>
      </SettingCard>

      {/* Registration page — mirrors the per-event theme fields */}
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="type-label text-muted-foreground">Registration page</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            How the shared public form looks. Leave a field blank to use the default.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cluster-page-title">Page Title</Label>
          <Input
            id="cluster-page-title"
            value={page.registrationPageTitle}
            onChange={(e) => setPageField("registrationPageTitle", e.target.value)}
            placeholder={`Defaults to “${clusterName} Registration”`}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cluster-page-description">Description</Label>
          <Textarea
            id="cluster-page-description"
            value={page.registrationPageDescription}
            onChange={(e) => setPageField("registrationPageDescription", e.target.value)}
            rows={3}
            placeholder="Shown below the title. Defaults to the cluster date when blank."
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <LogoUploader
            label="Logo"
            value={page.logoUrl || null}
            onChange={(url) => setPageField("logoUrl", url ?? "")}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <LogoUploader
            label="Banner Image"
            value={page.registrationPageBannerUrl || null}
            onChange={(url) => setPageField("registrationPageBannerUrl", url ?? "")}
          />
          <p className="text-xs text-muted-foreground">
            Full-cover background behind the header. Leave blank to use the color below.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cluster-page-color">Primary Color</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              id="cluster-page-color-picker"
              value={page.themeColorPrimary || "#000000"}
              onChange={(e) => setPageField("themeColorPrimary", e.target.value)}
              className="h-9 w-12 cursor-pointer rounded border border-input bg-background p-1"
            />
            <Input
              id="cluster-page-color"
              value={page.themeColorPrimary}
              onChange={(e) => setPageField("themeColorPrimary", e.target.value)}
              placeholder="#3b82f6"
              className="w-36 font-mono"
            />
          </div>
        </div>

        {pageDirty && (
          <div>
            <Button onClick={handleSavePage} disabled={savingPage}>
              {savingPage ? "Saving…" : "Save settings"}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
