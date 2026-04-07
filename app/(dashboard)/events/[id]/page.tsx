import { redirect } from "next/navigation"

export default async function LegacyEventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/event/${id}/dashboard`)
}
