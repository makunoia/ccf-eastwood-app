import type { Metadata } from "next"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { RevokeButton } from "./revoke-button"

export const metadata: Metadata = { title: "Connected Apps · Settings" }

export default async function ConnectedAppsPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (session.user.role !== "SuperAdmin") redirect("/settings")
  const tokens = await db.mcpToken.findMany({ orderBy: { createdAt: "desc" }, include: { user: { select: { name: true, username: true } } } })
  return <div className="flex flex-1 flex-col gap-4 p-6">
    <PageHeader title="Connected Apps" description="Churchie access granted to ChatGPT and other MCP clients" />
    <Card><CardContent className="p-0">
      {tokens.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No apps have been connected.</p> : <div className="divide-y">
        {tokens.map((token) => <div key={token.id} className="flex items-center justify-between gap-4 p-4">
          <div className="min-w-0"><p className="font-medium">{token.clientId}</p><p className="text-sm text-muted-foreground">{token.user.name ?? token.user.username} · {token.scope}</p></div>
          {token.revokedAt ? <Badge variant="secondary">Revoked</Badge> : <RevokeButton tokenId={token.id} />}
        </div>)}
      </div>}
    </CardContent></Card>
  </div>
}
