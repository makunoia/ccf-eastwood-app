import { Prisma } from "@/app/generated/prisma/client"
import { db } from "@/lib/db"

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
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2034"
      ) throw error
    }
  }
  throw new Error("Serializable transaction retry exhausted")
}
