"use client"

import * as React from "react"
import { IconCheck } from "@tabler/icons-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { addBaptismOptIn, removeBaptismOptIn } from "@/app/(dashboard)/events/module-actions"

// ─── Types ────────────────────────────────────────────────────────────────────

type Registrant = {
  id: string
  memberId: string | null
  firstName: string | null
  lastName: string | null
  mobileNumber: string | null
  attendedAt: string | null
  member: { id: string; firstName: string; lastName: string; phone: string | null } | null
  guest: { id: string; firstName: string; lastName: string; phone: string | null } | null
  baptismOptIn: { id: string } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function displayName(r: Registrant) {
  if (r.member) return `${r.member.firstName} ${r.member.lastName}`
  if (r.guest)  return `${r.guest.firstName} ${r.guest.lastName}`
  return `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim()
}

function displayMobile(r: Registrant) {
  if (r.member) return r.member.phone
  if (r.guest)  return r.guest.phone
  return r.mobileNumber
}

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  eventId: string
  registrants: Registrant[]
}

export function BaptismClient({ eventId, registrants }: Props) {
  const [toggling, setToggling] = React.useState<string | null>(null)

  const attended = registrants.filter((r) => r.attendedAt)
  const optedIn = registrants.filter((r) => r.baptismOptIn)

  async function toggle(r: Registrant) {
    setToggling(r.id)
    const result = r.baptismOptIn
      ? await removeBaptismOptIn(eventId, r.id)
      : await addBaptismOptIn(eventId, r.id)
    setToggling(null)
    if (!result.success) toast.error(result.error)
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Baptism</h2>
        <Badge variant="secondary">{optedIn.length} opted in</Badge>
      </div>

      {attended.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
          <p className="text-sm">No attended registrants yet.</p>
          <p className="text-xs">Mark attendance first — only attended registrants are shown here.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Contact</th>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-left font-medium">Baptism</th>
              </tr>
            </thead>
            <tbody>
              {attended.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{displayName(r)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{displayMobile(r) ?? "—"}</td>
                  <td className="px-4 py-3">
                    {r.memberId
                      ? <Badge variant="secondary">Member</Badge>
                      : <Badge variant="outline">Guest</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      size="sm"
                      variant={r.baptismOptIn ? "default" : "outline"}
                      onClick={() => toggle(r)}
                      disabled={toggling === r.id}
                    >
                      {r.baptismOptIn
                        ? <><IconCheck className="mr-1 size-3.5" />Opted in</>
                        : "Add"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
