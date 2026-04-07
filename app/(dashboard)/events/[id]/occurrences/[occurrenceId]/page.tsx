import { redirect } from "next/navigation"

export default async function LegacyOccurrencePage({
  params,
}: {
  params: Promise<{ id: string; occurrenceId: string }>
}) {
  const { id, occurrenceId } = await params
  redirect(`/event/${id}/sessions/${occurrenceId}`)
}
