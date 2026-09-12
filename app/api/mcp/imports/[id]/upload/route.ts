import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3"
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { r2, R2_BUCKET, R2_FOLDER } from "@/lib/r2"
import { verifyMcpAccessToken, actorCan } from "@/lib/mcp/auth"
import { actorForUser } from "@/lib/mcp/auth"
import { auth } from "@/lib/auth"
import { extractDGroupWorkbookProposals, inspectWorkbook } from "@/lib/mcp/workbook"

export const runtime = "nodejs"
const MAX_SIZE = 20 * 1024 * 1024

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = request.headers.get("authorization")
  const session = await auth()
  const actor = authorization?.startsWith("Bearer ")
    ? await verifyMcpAccessToken(authorization.slice(7))
    : session?.user?.id
      ? await actorForUser(session.user.id, "churchie:small-groups:read churchie:small-groups:write churchie:small-groups:import")
      : null
  if (!actor || !actorCan(actor, "SmallGroups", "Import")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const form = await request.formData()
  const file = form.get("file")
  if (!(file instanceof File)) return NextResponse.json({ error: "A workbook file is required." }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "Workbook exceeds the 20 MB limit." }, { status: 400 })
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return NextResponse.json({ error: "Only .xlsx, .xls, and .csv files are supported." }, { status: 400 })
  const { id } = await params
  const batch = await db.dGroupImportBatch.findFirst({ where: { id, userId: actor.id }, select: { id: true, status: true } })
  if (!batch || batch.status !== "Draft") return NextResponse.json({ error: "Import batch is unavailable." }, { status: 404 })
  let sourceKey: string | null = null
  let claimed = false
  try {
    const buffer = await file.arrayBuffer()
    const [parsedTables, proposals] = await Promise.all([inspectWorkbook(buffer), extractDGroupWorkbookProposals(buffer)])
    const claim = await db.dGroupImportBatch.updateMany({ where: { id: batch.id, userId: actor.id, status: "Draft" }, data: { status: "Applying" } })
    if (claim.count !== 1) return NextResponse.json({ error: "A workbook upload is already in progress for this batch." }, { status: 409 })
    claimed = true
    sourceKey = `${R2_FOLDER}/mcp-imports/${batch.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`
    await r2.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: sourceKey, Body: Buffer.from(buffer), ContentType: file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }))
    await db.$transaction([
      db.dGroupImportBatch.update({ where: { id: batch.id }, data: { fileName: file.name, sourceKey, parsedTables, status: "NeedsClarification" } }),
      ...(proposals.length ? [db.dGroupImportChange.createMany({ data: proposals.map((proposal) => ({ batchId: batch.id, ...proposal })) })] : []),
    ])
    return NextResponse.json({ success: true, batchId: batch.id, tables: parsedTables, proposalCount: proposals.length })
  } catch {
    if (sourceKey) {
      try { await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: sourceKey })) } catch { /* Retention cleanup can retry an orphaned object. */ }
    }
    if (claimed) await db.dGroupImportBatch.updateMany({ where: { id: batch.id, status: "Applying" }, data: { status: "Draft" } })
    return NextResponse.json({ error: "The workbook could not be parsed or stored." }, { status: 400 })
  }
}
