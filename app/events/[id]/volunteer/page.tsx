import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { getEventName } from "@/lib/metadata"
import { VolunteerSignUpForm } from "@/app/volunteers/volunteer-sign-up-form"
import { FormClosed } from "@/components/form-closed"
import { getFormConfig } from "@/lib/forms/config"

async function getEvent(id: string) {
  return db.event.findUnique({
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const name = await getEventName(id)
  return { title: { absolute: name ? `Volunteer Sign-Up · ${name}` : "Volunteer Sign-Up" } }
}

export default async function EventVolunteerSignUpPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const event = await getEvent(id)
  if (!event) notFound()

  const formConfig = await getFormConfig("VolunteerSignUp", id)
  if (!formConfig.isOpen) return <FormClosed />

  return (
    <VolunteerSignUpForm
      contextName={event.name}
      eventId={event.id}
      committees={event.committees}
    />
  )
}
