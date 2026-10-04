import { beforeEach, describe, expect, it, vi } from "vitest"
import { Prisma } from "@/app/generated/prisma/client"
import { db } from "@/lib/db"
import { withSerializableRetry } from "@/lib/db/serializable-retry"

vi.mock("@/lib/db", () => ({ db: { $transaction: vi.fn() } }))

function adapterConflict(code: string, kind = "TransactionWriteConflict") {
  return new Error(kind, { cause: { kind, originalCode: code } })
}

beforeEach(() => { vi.mocked(db.$transaction).mockReset() })

describe("serializable transaction retry", () => {
  it.each(["40001", "40P01"])("replays the full transaction for adapter conflict %s", async (code) => {
    const transaction = {} as Prisma.TransactionClient
    const run = vi.fn().mockRejectedValueOnce(adapterConflict(code)).mockResolvedValueOnce("saved")
    vi.mocked(db.$transaction).mockImplementation(async (callback) => {
      return (callback as (tx: Prisma.TransactionClient) => Promise<string>)(transaction)
    })
    await expect(withSerializableRetry(run)).resolves.toBe("saved")
    expect(run).toHaveBeenCalledTimes(2)
    expect(db.$transaction).toHaveBeenCalledWith(run, { isolationLevel: "Serializable" })
  })

  it("continues to retry Prisma P2034 errors", async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError("Write conflict", { code: "P2034", clientVersion: "7" })
    vi.mocked(db.$transaction).mockRejectedValueOnce(conflict).mockResolvedValueOnce("saved")
    await expect(withSerializableRetry(vi.fn())).resolves.toBe("saved")
    expect(db.$transaction).toHaveBeenCalledTimes(2)
  })

  it("stops after three failed attempts and preserves the error", async () => {
    const conflict = adapterConflict("40001")
    vi.mocked(db.$transaction).mockRejectedValue(conflict)
    await expect(withSerializableRetry(vi.fn())).rejects.toBe(conflict)
    expect(db.$transaction).toHaveBeenCalledTimes(3)
  })

  it.each([
    adapterConflict("23505"),
    adapterConflict("40001", "OtherError"),
    new Error("Invalid session"),
  ])("does not retry unrelated failures", async (error) => {
    vi.mocked(db.$transaction).mockRejectedValue(error)
    await expect(withSerializableRetry(vi.fn())).rejects.toBe(error)
    expect(db.$transaction).toHaveBeenCalledTimes(1)
  })
})
