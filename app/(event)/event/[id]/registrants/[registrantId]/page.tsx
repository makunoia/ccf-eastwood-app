import { notFound } from "next/navigation"
import Link from "next/link"
import { IconArrowLeft } from "@tabler/icons-react"

import { db } from "@/lib/db"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { BreakoutSection } from "./breakout-match-section"
import { RegistrantGuestProfile } from "./registrant-profile"

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

async function getRegistrant(registrantId: string, eventId: string) {
  return db.eventRegistrant.findFirst({
    where: { id: registrantId, eventId },
    select: {
      id: true,
      memberId: true,
      guestId: true,
      firstName: true,
      lastName: true,
      nickname: true,
      email: true,
      mobileNumber: true,
      isPaid: true,
      paymentReference: true,
      attendedAt: true,
      member: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
          address: true,
          dateJoined: true,
          notes: true,
          birthMonth: true,
          birthYear: true,
        },
      },
      guest: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
          notes: true,
          birthMonth: true,
          birthYear: true,
          lifeStageId: true,
          gender: true,
          language: true,
          workCity: true,
          workIndustry: true,
          meetingPreference: true,
        },
      },
      breakoutGroupMemberships: {
        select: {
          breakoutGroup: { select: { id: true, name: true } },
        },
      },
    },
  })
}

/** Returns the breakout group this member facilitates or co-facilitates in this event, if any. */
async function getFacilitatedGroup(memberId: string, eventId: string) {
  return db.breakoutGroup.findFirst({
    where: {
      eventId,
      OR: [
        { facilitator: { memberId, eventId } },
        { coFacilitator: { memberId, eventId } },
      ],
    },
    select: { id: true, name: true },
  })
}

async function getAllEventGroups(eventId: string, excludeIds: string[]) {
  const groups = await db.breakoutGroup.findMany({
    where: { eventId },
    select: {
      id: true,
      name: true,
      memberLimit: true,
      _count: { select: { members: true } },
    },
    orderBy: { name: "asc" },
  })
  return groups
    .filter((g) => !excludeIds.includes(g.id))
    .map((g) => ({ id: g.id, name: g.name, memberLimit: g.memberLimit, currentCount: g._count.members }))
}

function resolveDisplayName(r: NonNullable<Awaited<ReturnType<typeof getRegistrant>>>) {
  if (r.member) return `${r.member.firstName} ${r.member.lastName}`
  if (r.guest) return `${r.guest.firstName} ${r.guest.lastName}`
  return `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || "—"
}

export default async function RegistrantDetailPage({
  params,
}: {
  params: Promise<{ id: string; registrantId: string }>
}) {
  const { id: eventId, registrantId } = await params
  const registrant = await getRegistrant(registrantId, eventId)
  if (!registrant) notFound()

  const assignedGroupIds = registrant.breakoutGroupMemberships.map((m) => m.breakoutGroup.id)
  const isAssigned = assignedGroupIds.length > 0

  const [facilitatedGroup, allEventGroups] = await Promise.all([
    registrant.memberId ? getFacilitatedGroup(registrant.memberId, eventId) : null,
    getAllEventGroups(eventId, assignedGroupIds),
  ])

  const name = resolveDisplayName(registrant)

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <Link
          href={`/event/${eventId}/registrants`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <IconArrowLeft className="size-4" />
          Registrants
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <h2 className="text-xl font-semibold">{name}</h2>
        {registrant.memberId ? (
          <Badge variant="secondary">Member</Badge>
        ) : (
          <Badge variant="outline">Guest</Badge>
        )}
      </div>

      <div className="max-w-2xl space-y-8">
        {/* Breakout group section — always first */}
        <section className="space-y-3">
          {isAssigned ? (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">Breakout Group</h3>
              <div className="rounded-lg border p-3">
                {registrant.breakoutGroupMemberships.map((m) => (
                  <Link
                    key={m.breakoutGroup.id}
                    href={`/event/${eventId}/breakouts/${m.breakoutGroup.id}`}
                    className="text-sm font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                  >
                    {m.breakoutGroup.name}
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <BreakoutSection
              registrantId={registrantId}
              eventId={eventId}
              facilitatedGroup={facilitatedGroup ?? null}
              allEventGroups={allEventGroups}
            />
          )}
        </section>

        {/* Profile section */}
        {registrant.guest && (
          <RegistrantGuestProfile guest={registrant.guest} />
        )}

        {registrant.member && (
          <MemberReadOnly member={registrant.member} memberId={registrant.member.id} />
        )}

        {!registrant.guest && !registrant.member && (
          <section className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">Contact</h3>
            <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <span className="text-muted-foreground">Mobile</span>
              <span>{registrant.mobileNumber ?? <span className="text-muted-foreground">—</span>}</span>
              <span className="text-muted-foreground">Email</span>
              <span>{registrant.email ?? <span className="text-muted-foreground">—</span>}</span>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

type MemberData = NonNullable<
  NonNullable<Awaited<ReturnType<typeof getRegistrant>>>["member"]
>

function MemberReadOnly({ member, memberId }: { member: MemberData; memberId: string }) {
  const birthMonthName = member.birthMonth ? MONTHS[member.birthMonth - 1] : null
  const dateJoinedStr = member.dateJoined
    ? new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric" }).format(
        member.dateJoined
      )
    : null

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-medium text-muted-foreground">Profile</h3>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>First Name</Label>
            <Input value={member.firstName} readOnly />
          </div>
          <div className="space-y-2">
            <Label>Last Name</Label>
            <Input value={member.lastName} readOnly />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={member.email ?? ""} placeholder="—" readOnly />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input value={member.phone ?? ""} placeholder="—" readOnly />
          </div>
        </div>

        {member.address && (
          <div className="space-y-2">
            <Label>Address</Label>
            <Input value={member.address} readOnly />
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Date Joined</Label>
            <Input value={dateJoinedStr ?? ""} placeholder="—" readOnly />
          </div>
        </div>

        {(birthMonthName || member.birthYear) && (
          <div className="grid sm:grid-cols-2 gap-4">
            {birthMonthName && (
              <div className="space-y-2">
                <Label>Birth Month</Label>
                <Input value={birthMonthName} readOnly />
              </div>
            )}
            {member.birthYear && (
              <div className="space-y-2">
                <Label>Birth Year</Label>
                <Input value={String(member.birthYear)} readOnly />
              </div>
            )}
          </div>
        )}

        {member.notes && (
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={member.notes} readOnly rows={3} />
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="outline" asChild>
            <Link href={`/members/${memberId}`}>View Member Information</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
