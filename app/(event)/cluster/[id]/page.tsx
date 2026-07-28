import { redirect } from "next/navigation"

export default async function ClusterRootPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/cluster/${id}/dashboard`)
}
