import { describe, it, expect } from "vitest"
import { isPublicPath } from "@/lib/public-routes"

/**
 * Guards the proxy's public-path allowlist. A public form dropping off this
 * list is invisible in normal QA — anyone testing is already signed in — so
 * every public surface gets pinned here.
 */
describe("isPublicPath", () => {
  describe("cluster shared registration form (regression)", () => {
    // Regression: /register/c/[token] was missing from the allowlist, so the
    // public Event Cluster registration form redirected everyone to /login.
    it("allows the cluster registration form", () => {
      expect(isPublicPath("/register/c/abc123")).toBe(true)
    })

    it("allows the cluster walk-in variant with query-string params", () => {
      // The proxy matches on pathname only; the ?checkin=1&mobile= params the
      // check-in board appends must not be part of the match.
      expect(isPublicPath("/register/c/abc123")).toBe(true)
      expect(isPublicPath("/register/c/tok-with-dashes_and_underscores")).toBe(true)
    })

    it("does not allow the authenticated cluster workspace", () => {
      expect(isPublicPath("/cluster/clu_1")).toBe(false)
      expect(isPublicPath("/cluster/clu_1/checkin")).toBe(false)
      expect(isPublicPath("/cluster/clu_1/forms/registration")).toBe(false)
      expect(isPublicPath("/cluster/clu_1/registrants")).toBe(false)
    })

    it("does not allow a bare /register with no token", () => {
      expect(isPublicPath("/register")).toBe(false)
      expect(isPublicPath("/register/c")).toBe(false)
      expect(isPublicPath("/register/c/")).toBe(false)
    })
  })

  describe("per-event public forms", () => {
    it.each([
      "/events/evt_1/register",
      "/events/evt_1/checkin",
      "/events/evt_1/checkin/occ_1",
      "/events/evt_1/catch-mech",
      "/events/evt_1/catch-mech/tok_1",
      "/events/evt_1/volunteer",
      "/events/evt_1/volunteer-info",
      "/ministries/min_1/volunteer",
    ])("allows %s", (path) => {
      expect(isPublicPath(path)).toBe(true)
    })

    it("does not allow the authenticated event workspace", () => {
      expect(isPublicPath("/event/evt_1/registrants")).toBe(false)
      expect(isPublicPath("/event/evt_1/checkin")).toBe(false)
      expect(isPublicPath("/events")).toBe(false)
      expect(isPublicPath("/events/clusters")).toBe(false)
    })
  })

  describe("other public forms and token links", () => {
    it.each([
      "/join-small-group",
      "/volunteer-approval/tok_1",
      "/small-group-confirmation/tok_1",
      "/me",
      "/me/tok_1",
      "/login",
      "/api/auth/session",
    ])("allows %s", (path) => {
      expect(isPublicPath(path)).toBe(true)
    })
  })

  describe("admin surfaces stay private", () => {
    it.each([
      "/dashboard",
      "/members",
      "/guests",
      "/small-groups",
      "/ministries",
      "/volunteers",
      "/settings",
      "/settings/matching-weights",
      "/api/assistant",
    ])("blocks %s", (path) => {
      expect(isPublicPath(path)).toBe(false)
    })
  })
})
