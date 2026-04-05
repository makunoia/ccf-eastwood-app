import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { VolunteerSignUpForm } from "@/app/volunteers/volunteer-sign-up-form"

async function getMinistry(id: string) {
  return db.ministry.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      committees: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          roles: {
            orderBy: { createdAt: "asc" },
            select: { id: true, name: true },
          },
        },
      },
    },
  })
}

export default async function MinistryVolunteerSignUpPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ministry = await getMinistry(id)
  if (!ministry) notFound()

  return (
    <VolunteerSignUpForm
      contextName={`${ministry.name} Ministry`}
      ministryId={ministry.id}
      committees={ministry.committees}
    />
  )
}
