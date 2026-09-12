import { DeleteObjectsCommand } from "@aws-sdk/client-s3"
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { r2, R2_BUCKET } from "@/lib/r2"

export const runtime = "nodejs"

/** Removes private source workbooks once their 30-day retention window ends. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const expired = await db.dGroupImportBatch.findMany({
    where: { expiresAt: { lte: new Date() }, sourceKey: { not: null } },
    select: { id: true, sourceKey: true },
    take: 100,
  })
  const keys = expired.flatMap((batch) => batch.sourceKey ? [{ Key: batch.sourceKey }] : [])
  if (keys.length) await r2.send(new DeleteObjectsCommand({ Bucket: R2_BUCKET, Delete: { Objects: keys, Quiet: true } }))
  // Keep the batch/change rows as the durable audit summary; only the source
  // workbook is subject to the 30-day retention window.
  if (expired.length) await db.dGroupImportBatch.updateMany({ where: { id: { in: expired.map((batch) => batch.id) } }, data: { sourceKey: null } })
  return NextResponse.json({ deleted: keys.length })
}
