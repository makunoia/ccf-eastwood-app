import { existsSync } from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"

function normalizeTicketKey(raw: string): string {
  const normalized = raw.trim().toUpperCase()
  if (!/^CCF-\d+$/.test(normalized)) {
    throw new Error(`Invalid ticket key: ${raw}. Expected format CCF-123.`)
  }
  return normalized
}

function main(): void {
  const rawKey = process.argv[2]
  if (!rawKey) {
    throw new Error("Missing ticket key. Usage: pnpm verify:ticket CCF-123")
  }

  const ticketKey = normalizeTicketKey(rawKey)
  const fileName = `${ticketKey.toLowerCase()}.test.ts`
  const filePath = path.resolve(__dirname, "../tests/tickets", fileName)
  const displayPath = `tests/tickets/${fileName}`

  if (!existsSync(filePath)) {
    throw new Error(
      [
        `Missing ticket verification file: ${displayPath}`,
        `Create it with: pnpm ticket:test:new ${ticketKey}`,
      ].join("\n")
    )
  }

  const result = spawnSync("pnpm", ["-s", "vitest", "run", filePath], {
    stdio: "inherit",
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }

  console.log(`Ticket verification passed for ${ticketKey}.`)
}

main()
