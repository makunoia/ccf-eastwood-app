import { vi } from "vitest"

// Mock Next.js cache APIs — not available outside the Next.js runtime
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  // Pass through to original fn — caching is a no-op in tests
  unstable_cache: vi.fn(<T extends (...args: unknown[]) => unknown>(fn: T) => fn),
}))
