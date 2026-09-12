import { NextResponse } from "next/server"
import { revokeMcpToken } from "@/lib/mcp/auth"

export async function POST(request: Request) {
  const form = await request.formData()
  const token = form.get("token")
  if (typeof token === "string" && token) await revokeMcpToken(token)
  return new NextResponse(null, { status: 200 })
}
