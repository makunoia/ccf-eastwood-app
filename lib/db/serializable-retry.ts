import { Prisma } from "@/app/generated/prisma/client"
import { db } from "@/lib/db"

function isTransactionWriteConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return true
  // The PostgreSQL adapter can expose a commit-time serialization failure
  // directly instead of wrapping it in Prisma's P2034 request error.
  if (!(error instanceof Error) || !("cause" in error)) return false
  const cause = error.cause
  if (!cause || typeof cause !== "object" || !("kind" in cause) || !("originalCode" in cause)) return false
  return cause.kind === "TransactionWriteConflict" &&
    (cause.originalCode === "40001" || cause.originalCode === "40P01")
}

/** Retry the whole read-and-write decision after a serializable conflict. */
export async function withSerializableRetry<T>(
  run: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(run, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      })
    } catch (error) {
      if (
        attempt === 2 ||
        !isTransactionWriteConflict(error)
      ) throw error
    }
  }
  throw new Error("Serializable transaction retry exhausted")
}
