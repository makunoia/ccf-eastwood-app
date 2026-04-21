import { notFound } from "next/navigation"
import Link from "next/link"

import { db } from "@/lib/db"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { RegistrantGuestProfile } from "@/app/(event)/event/[id]/registrants/[registrantId]/registrant-profile"
import { CatchMechMatchSection } from "./catch-mech-match-section"

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

const VALID_STATUSES = ["confirmed", "rejected", "pending"] as const
type Status = (typeof VALID_STATUSES)[number]
const STATUS_PRISMA: Record<Status, "Confirmed" | "Rejected" | "Pending"> = {
  confirmed: "Confirmed",
  rejected: "Rejected",
  pending: "Pending",
}
const STATUS_LABEL: Record<Status, string> = {
  confirmed: "Confirmed",
  rejected: "Rejected",
  pending: "Pending",
}

async function getDetailData(registrantId: string, eventId: string, prismaStatus: "Confirmed" | "Rejected" | "Pending") {
  const eventBreakoutGroups = await db.breakoutGroup.findMany({
    where: { eventId },
    select: { id: true },
  })
  const breakoutGroupIds = eventBreakoutGroups.map((bg) => bg.id)

  const [registrant, request, lifeStages] = await Promise.all([
    db.eventRegistrant.findFirst({
      where: { id: registrantId, eventId },
      select: {
        id: true,
        memberId: true,
        guestId: true,
        firstName: true,
        lastName: true,
        mobileNumber: true,
        email: true,
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
      },
    }),
    db.smallGroupMemberRequest.findFirst({
      where: {
        status: prismaStatus,
        breakoutGroupId: { in: breakoutGroupIds },
        OR: [
          { guest: { eventRegistrations: { some: { id: registrantId } } } },
          { member: { eventRegistrations: { some: { id: registrantId } } } },
        ],
      },
      select: {
        smallGroupId: true,
        smallGroup: {
          select: {
            id: true,
            name: true,
            leader: { select: { firstName: true, lastName: true } },
          },
        },
      },
    }),
    db.lifeStage.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true } }),
  ])

  if (!registrant) return null

  return { registrant, request, lifeStages }
}

export default async function CatchMechDetailPage({
  params,
}: {
  params: Promise<{ id: string; status: string; rid: string }>
}) {
  const { id: eventId, status: rawStatus, rid: registrantId } = await params

  if (!VALID_STATUSES.includes(rawStatus as Status)) notFound()
  const status = rawStatus as Status

  const data = await getDetailData(registrantId, eventId, STATUS_PRISMA[status])
  if (!data) notFound()

  const { registrant, request, lifeStages } = data

  let name: string
  if (registrant.member) {
    name = `${registrant.member.firstName} ${registrant.member.lastName}`
  } else if (registrant.guest) {
    name = `${registrant.guest.firstName} ${registrant.guest.lastName}`
  } else {
    name = `${registrant.firstName ?? ""} ${registrant.lastName ?? ""}`.trim() || "—"
  }

  const profileLink = registrant.memberId
    ? `/members/${registrant.memberId}`
    : registrant.guestId
    ? `/guests/${registrant.guestId}`
    : null

  const initialPrefs = {
    lifeStageId: registrant.guest?.lifeStageId ?? "",
    language: registrant.guest?.language ?? [],
    meetingPreference: registrant.guest?.meetingPreference ?? "",
    workCity: registrant.guest?.workCity ?? "",
    workIndustry: registrant.guest?.workIndustry ?? "",
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link href={`/event/${eventId}/catch-mech`} className="hover:text-foreground transition-colors">
          ← Catch Mech
        </Link>
        <span>/</span>
        <Link href={`/event/${eventId}/catch-mech/${status}`} className="hover:text-foreground transition-colors">
          {STATUS_LABEL[status]}
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">{name}</span>
      </nav>

      {/* Name + type badge */}
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-semibold">{name}</h2>
        {registrant.memberId ? (
          <Badge variant="secondary">Member</Badge>
        ) : (
          <Badge variant="outline">Guest</Badge>
        )}
      </div>

      {/* Tabs */}
      <div className="max-w-2xl">
        <Tabs defaultValue="details">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="small-group">Small Group</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="mt-4 space-y-4">
            {registrant.guest && (
              <>
                <RegistrantGuestProfile guest={registrant.guest} />
                {profileLink && (
                  <div className="flex justify-end">
                    <Button variant="outline" asChild>
                      <Link href={profileLink}>View full profile</Link>
                    </Button>
                  </div>
                )}
              </>
            )}
            {registrant.member && (
              <MemberReadOnly
                member={registrant.member}
                memberId={registrant.member.id}
              />
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
          </TabsContent>

          <TabsContent value="small-group" className="mt-4">
            {status === "confirmed" && request?.smallGroup && (
              <div className="rounded-lg border p-4 space-y-2">
                <p className="text-sm font-medium">Member of this group</p>
                <p className="text-sm">
                  <Link
                    href={`/small-groups/${request.smallGroup.id}`}
                    className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                  >
                    {request.smallGroup.name}
                  </Link>
                </p>
                {request.smallGroup.leader && (
                  <p className="text-sm text-muted-foreground">
                    Led by {request.smallGroup.leader.firstName} {request.smallGroup.leader.lastName}
                  </p>
                )}
              </div>
            )}

            {status === "pending" && request?.smallGroup && (
              <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
                <p className="text-sm font-medium">Awaiting leader confirmation</p>
                <p className="text-sm">
                  <Link
                    href={`/small-groups/${request.smallGroup.id}`}
                    className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                  >
                    {request.smallGroup.name}
                  </Link>
                </p>
                {request.smallGroup.leader && (
                  <p className="text-sm text-muted-foreground">
                    Led by {request.smallGroup.leader.firstName} {request.smallGroup.leader.lastName}
                  </p>
                )}
              </div>
            )}

            {status === "rejected" && (
              <CatchMechMatchSection
                registrantId={registrantId}
                eventId={eventId}
                initialPrefs={initialPrefs}
                lifeStages={lifeStages}
              />
            )}

            {(status === "confirmed" || status === "pending") && !request?.smallGroup && (
              <p className="text-sm text-muted-foreground">No small group assigned.</p>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

// ─── MemberReadOnly ───────────────────────────────────────────────────────────

type MemberData = {
  id: string
  firstName: string
  lastName: string
  phone: string | null
  email: string | null
  address: string | null
  dateJoined: Date | null
  notes: string | null
  birthMonth: number | null
  birthYear: number | null
}

function MemberReadOnly({ member, memberId }: { member: MemberData; memberId: string }) {
  const birthMonthName = member.birthMonth ? MONTHS[member.birthMonth - 1] : null
  const dateJoinedStr = member.dateJoined
    ? new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric" }).format(member.dateJoined)
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
        {dateJoinedStr && (
          <div className="space-y-2">
            <Label>Date Joined</Label>
            <Input value={dateJoinedStr} readOnly />
          </div>
        )}
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
            <Link href={`/members/${memberId}`}>View full profile</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
