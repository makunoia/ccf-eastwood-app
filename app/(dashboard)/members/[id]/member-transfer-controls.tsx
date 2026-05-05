"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { IconClock, IconChevronDown, IconLoader } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { MemberMatchSection } from "./member-match-section"
import { assignMemberTransferTemporarily } from "@/app/(dashboard)/small-groups/actions"

type PendingTransfer = {
  id: string
  toGroupName: string
  createdAt: Date
}

type MatchingPrefs = {
  lifeStageId: string
  gender: string
  language: string[]
  workCity: string
  workIndustry: string
  meetingPreference: string
  scheduleDayOfWeek: string
  scheduleTimeStart: string
  scheduleTimeEnd: string
}

type Props = {
  memberId: string
  currentGroupId: string
  pendingTransfer: PendingTransfer | null
  initialPrefs: MatchingPrefs
  lifeStages: { id: string; name: string }[]
  allGroups: { id: string; name: string }[]
}

export function MemberTransferControls({
  memberId,
  currentGroupId,
  pendingTransfer,
  initialPrefs,
  lifeStages,
  allGroups,
}: Props) {
  const router = useRouter()
  const [autoMatchOpen, setAutoMatchOpen] = React.useState(false)
  const [manualOpen, setManualOpen] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [selectedGroupId, setSelectedGroupId] = React.useState<string | null>(null)
  const [transferring, setTransferring] = React.useState(false)

  const filteredGroups = allGroups
    .filter((g) => g.id !== currentGroupId)
    .filter((g) => g.name.toLowerCase().includes(searchQuery.toLowerCase()))

  async function handleManualTransfer() {
    if (!selectedGroupId) return
    setTransferring(true)
    const res = await assignMemberTransferTemporarily(selectedGroupId, memberId)
    setTransferring(false)
    if (res.success) {
      toast.success("Transfer request created — pending leader confirmation")
      setManualOpen(false)
      router.refresh()
    } else {
      toast.error(res.error)
    }
  }

  if (pendingTransfer) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Transfer</h3>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <IconClock className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-900">
                Transfer pending — {pendingTransfer.toGroupName}
              </p>
              <p className="text-xs text-amber-700">
                A transfer request to this group is awaiting leader confirmation. A new transfer cannot be initiated until the current request is resolved.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Transfer</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Move this member to a different small group.
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              Transfer
              <IconChevronDown className="ml-1 size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => setManualOpen(true)}>
              Manually
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setAutoMatchOpen(true)}>
              Auto-match
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Auto-match dialog */}
      <Dialog open={autoMatchOpen} onOpenChange={setAutoMatchOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Transfer — Auto-match</DialogTitle>
          </DialogHeader>
          <MemberMatchSection
            memberId={memberId}
            hasGroup={true}
            pendingTransfer={null}
            initialPrefs={initialPrefs}
            lifeStages={lifeStages}
            onSuccess={() => setAutoMatchOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Manual transfer dialog */}
      <Dialog
        open={manualOpen}
        onOpenChange={(open) => {
          setManualOpen(open)
          if (!open) {
            setSearchQuery("")
            setSelectedGroupId(null)
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Transfer to Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Search groups…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div className="max-h-64 overflow-y-auto space-y-1 rounded-md border p-1">
              {filteredGroups.length === 0 ? (
                <p className="p-3 text-center text-sm text-muted-foreground">
                  No groups found
                </p>
              ) : (
                filteredGroups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setSelectedGroupId(g.id)}
                    className={`w-full rounded px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${
                      selectedGroupId === g.id ? "bg-muted font-medium" : ""
                    }`}
                  >
                    {g.name}
                  </button>
                ))
              )}
            </div>
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  void handleManualTransfer()
                }}
                disabled={!selectedGroupId || transferring}
                size="sm"
              >
                {transferring && <IconLoader className="size-4 animate-spin" />}
                {transferring ? "Transferring…" : "Transfer"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
