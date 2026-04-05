"use client"

import * as React from "react"
import { IconCheck, IconSearch } from "@tabler/icons-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { markCheckinAttendance } from "@/app/(dashboard)/events/actions"

type Member = {
  id: string
  firstName: string
  lastName: string
  phone: string | null
}

type Registrant = {
  id: string
  memberId: string | null
  member: Member | null
  firstName: string | null
  lastName: string | null
  nickname: string | null
  mobileNumber: string | null
  attendedAt: Date | null
}

type Props = {
  eventId: string
  registrants: Registrant[]
}

function getDisplayName(r: Registrant) {
  if (r.member) {
    return `${r.member.firstName} ${r.member.lastName}`
  }
  return `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim()
}

function getDisplayMobile(r: Registrant) {
  return r.member ? r.member.phone : r.mobileNumber
}

export function CheckinBoard({ eventId, registrants: initial }: Props) {
  const [registrants, setRegistrants] = React.useState(initial)
  const [search, setSearch] = React.useState("")
  const [marking, setMarking] = React.useState<string | null>(null)

  const filtered = registrants.filter((r) => {
    const name = getDisplayName(r).toLowerCase()
    const mobile = getDisplayMobile(r) ?? ""
    const q = search.toLowerCase()
    return name.includes(q) || mobile.includes(q)
  })

  const checkedIn = registrants.filter((r) => r.attendedAt).length

  async function handleCheckin(r: Registrant) {
    if (r.attendedAt) return
    setMarking(r.id)
    const result = await markCheckinAttendance(r.id)
    setMarking(null)
    if (result.success) {
      setRegistrants((prev) =>
        prev.map((reg) =>
          reg.id === r.id ? { ...reg, attendedAt: new Date() } : reg
        )
      )
      toast.success(`${getDisplayName(r)} checked in`)
    } else {
      toast.error(result.error)
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Stats */}
      <div className="flex items-center gap-3">
        <Badge variant="secondary" className="text-sm">
          {checkedIn} / {registrants.length} checked in
        </Badge>
      </div>

      {/* Search */}
      <div className="relative">
        <IconSearch className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by name or mobile…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
      </div>

      {/* Registrant list */}
      <div className="flex flex-col gap-2">
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No registrants found
          </p>
        )}
        {filtered.map((r) => {
          const attended = !!r.attendedAt
          return (
            <div
              key={r.id}
              className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${
                attended ? "border-green-200 bg-green-50" : ""
              }`}
            >
              <div>
                <p className="font-medium text-sm">{getDisplayName(r)}</p>
                {r.nickname && (
                  <p className="text-xs text-muted-foreground">{r.nickname}</p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">
                  {getDisplayMobile(r) ?? "—"}
                </p>
              </div>
              <Button
                size="sm"
                variant={attended ? "secondary" : "default"}
                onClick={() => handleCheckin(r)}
                disabled={attended || marking === r.id}
              >
                {attended ? (
                  <>
                    <IconCheck className="mr-1 size-3.5" />
                    Checked in
                  </>
                ) : marking === r.id ? (
                  "Checking in…"
                ) : (
                  "Check in"
                )}
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
