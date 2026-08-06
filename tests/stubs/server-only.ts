/**
 * `server-only` is a build-time guard Next.js resolves itself — it is not an
 * installed package, so Vite can't resolve the bare import when it transforms a
 * module that uses it.
 *
 * `tests/setup.ts` already mocks the module for node-environment tests, but that
 * runs after transform; a component test (jsdom) fails at import-analysis first.
 * vitest.config.ts aliases the specifier here so the import is simply a no-op,
 * which is what the guard amounts to outside a Next build.
 */
export {}
