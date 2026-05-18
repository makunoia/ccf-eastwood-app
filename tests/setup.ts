import { vi } from "vitest"

// server-only is a Next.js guard — it's a no-op in tests
vi.mock("server-only", () => ({}))

// next-auth cannot resolve next/server outside the Next.js runtime — mock the whole module
vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue(null),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
}))

// Mock Next.js cache APIs — not available outside the Next.js runtime
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  // Pass through to original fn — caching is a no-op in tests
  unstable_cache: vi.fn(<T extends (...args: unknown[]) => unknown>(fn: T) => fn),
}))
