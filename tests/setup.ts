import { vi } from "vitest"

const defaultSession = {
  user: {
    id: undefined,
    name: "Test Admin",
    email: "test@example.com",
    username: "test-admin",
    role: "SuperAdmin",
    permissions: [],
    eventAccess: [],
    totpEnabled: false,
    mustChangePassword: false,
    requiresTotpSetup: false,
  },
}

// server-only is a Next.js guard — it's a no-op in tests
vi.mock("server-only", () => ({}))

// next-auth cannot resolve next/server outside the Next.js runtime — mock the whole module
vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue(defaultSession),
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

// jsdom implements no media queries, so anything reaching `useIsMobile` — which
// now includes every table, via the column picker's responsive Drawer — throws
// before it renders. Defined here rather than per test file so a component test
// doesn't have to know which of its descendants happens to ask.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}
