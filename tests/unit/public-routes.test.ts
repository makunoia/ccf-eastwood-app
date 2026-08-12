import { describe, it, expect } from "vitest"
import {
  clusterCheckinPath,
  clusterRegisterPath,
  clusterWalkInBackPath,
  clusterWalkInPath,
  isPublicPath,
} from "@/lib/public-routes"

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

    it("allows the cluster walk-in route and tolerates query-string params", () => {
      // The proxy matches on pathname only; the ?mobile= param the check-in
      // board appends must not be part of the match.
      expect(isPublicPath("/register/c/abc123/walk-in")).toBe(true)
      expect(isPublicPath("/register/c/tok-with-dashes_and_underscores")).toBe(true)
    })

    it("builds links that stay inside the allowlist", () => {
      // The shortcut on the check-in board is built from these, so a change to
      // either shape has to keep landing on a path the proxy lets through.
      expect(clusterRegisterPath("abc123")).toBe("/register/c/abc123")
      expect(clusterWalkInPath("abc123")).toBe("/register/c/abc123/walk-in")
      expect(isPublicPath(new URL(clusterWalkInPath("abc123"), "http://x").pathname)).toBe(
        true
      )
    })

    /**
     * Regression: the door's "Back" / "Back to check-in" pointed at
     * `/cluster/[id]/checkin` — the admin board. Finishing a walk-in on a public
     * link therefore dumped the person at the door onto /login, and an admin who
     * opened the door from the workspace ended up back inside the workspace.
     */
    describe("the walk-in door's way back", () => {
      it("returns to the public kiosk, never the cluster workspace", () => {
        const back = clusterWalkInBackPath("abc123", true)
        expect(back).toBe(clusterCheckinPath("abc123"))
        expect(isPublicPath(back!)).toBe(true)
        expect(back).not.toContain("/cluster/")
      })

      it("offers nothing while the kiosk is closed", () => {
        // The kiosk has its own switch — a way back to a closed link is worse
        // than no way back.
        expect(clusterWalkInBackPath("abc123", false)).toBeUndefined()
      })
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
      // Regression (CCF-133): walk-in is its own route now. The /register
      // pattern does not cover it, so a missing entry would bounce every
      // walk-in at the door to /login — invisible to signed-in QA.
      "/events/evt_1/walk-in",
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
      // Regression: the public "Find Your DGroup" form was missing from the
      // allowlist for the same reason the cluster form was.
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

    it("anchors /join-small-group so it cannot over-match a sibling route", () => {
      // The admin /small-groups workspace must stay private, and a prefix-only
      // match would leak any route merely starting with the same characters.
      expect(isPublicPath("/join-small-groups-admin")).toBe(false)
      expect(isPublicPath("/small-groups")).toBe(false)
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
