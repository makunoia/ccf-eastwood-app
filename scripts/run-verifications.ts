import { spawnSync } from "node:child_process"

// Run all ticket verification tests under tests/tickets/
const result = spawnSync("pnpm", ["-s", "vitest", "run", "tests/tickets"], {
  stdio: "inherit",
})

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

console.log("All ticket verifications passed.")