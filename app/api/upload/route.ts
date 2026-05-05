import { PutObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { r2, R2_BUCKET, R2_PUBLIC_URL, R2_FOLDER } from "@/lib/r2"

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"]
const MAX_SIZE = 5 * 1024 * 1024 // 5 MB

export async function POST(request: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { fileName, contentType, size } = await request.json()

  if (!ALLOWED_TYPES.includes(contentType)) {
    return NextResponse.json({ error: "File type not allowed" }, { status: 400 })
  }
  if (typeof size === "number" && size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large (max 5 MB)" }, { status: 400 })
  }

  const ext = fileName.split(".").pop() ?? "bin"
  const key = `${R2_FOLDER}/logos/${crypto.randomUUID()}.${ext}`

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ContentType: contentType,
  })

  const uploadUrl = await getSignedUrl(r2, command, { expiresIn: 120 })
  const publicUrl = `${R2_PUBLIC_URL}/${key}`

  return NextResponse.json({ uploadUrl, publicUrl })
}
