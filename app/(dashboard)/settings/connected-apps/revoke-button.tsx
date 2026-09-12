"use client"

import { useTransition } from "react"
import { IconBan } from "@tabler/icons-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { revokeConnectedApp } from "./actions"

export function RevokeButton({ tokenId }: { tokenId: string }) {
  const [pending, startTransition] = useTransition()
  return <Button size="sm" variant="outline" disabled={pending} onClick={() => startTransition(async () => {
    const result = await revokeConnectedApp(tokenId)
    if (result.success) toast.success("Connection revoked")
    else toast.error(result.error)
  })}><IconBan className="size-3.5" />{pending ? "Revoking…" : "Revoke"}</Button>
}
