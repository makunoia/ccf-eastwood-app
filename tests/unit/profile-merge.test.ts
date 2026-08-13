/**
 * CCF-147 — dirty-field overwrite vs fill-if-empty.
 *
 * The whole point of the touched set is that it changes behaviour for exactly
 * the fields the person edited and for nothing else, so the matrix below is the
 * spec: the "untouched" column has to reproduce what the resolvers did before
 * this change, or every existing registration path silently changes meaning.
 */
import { describe, it, expect } from "vitest"
import { shouldWriteProfileField, touchedFieldSet } from "@/lib/events/profile-merge"

const untouched = touchedFieldSet()
const touched = touchedFieldSet(["workCity"])

describe("shouldWriteProfileField — untouched (legacy fill-if-empty)", () => {
  it("writes into an empty stored value", () => {
    expect(shouldWriteProfileField(null, "Makati", untouched, "workCity")).toBe(true)
    expect(shouldWriteProfileField("", "Makati", untouched, "workCity")).toBe(true)
    expect(shouldWriteProfileField(undefined, "Makati", untouched, "workCity")).toBe(true)
  })

  it("never overwrites a stored value", () => {
    expect(shouldWriteProfileField("Ortigas", "Makati", untouched, "workCity")).toBe(false)
  })

  it("writes nothing when the submission has nothing", () => {
    expect(shouldWriteProfileField(null, null, untouched, "workCity")).toBe(false)
    expect(shouldWriteProfileField(null, "", untouched, "workCity")).toBe(false)
  })

  it("treats an empty array as unanswered on both sides", () => {
    expect(shouldWriteProfileField([], ["English"], untouched, "language")).toBe(true)
    expect(shouldWriteProfileField(["Tagalog"], ["English"], untouched, "language")).toBe(false)
    expect(shouldWriteProfileField([], [], untouched, "language")).toBe(false)
  })

  it("does not read 0 as unanswered — Sunday is a real schedule answer", () => {
    expect(shouldWriteProfileField(null, 0, untouched, "scheduleDayOfWeek")).toBe(true)
    expect(shouldWriteProfileField(0, 3, untouched, "scheduleDayOfWeek")).toBe(false)
  })
})

describe("shouldWriteProfileField — touched (the review screen's correction)", () => {
  it("overwrites a stored value", () => {
    expect(shouldWriteProfileField("Ortigas", "Makati", touched, "workCity")).toBe(true)
  })

  it("still writes into an empty stored value", () => {
    expect(shouldWriteProfileField(null, "Makati", touched, "workCity")).toBe(true)
  })

  it("refuses to clear a stored value — a public form is not where data gets deleted", () => {
    expect(shouldWriteProfileField("Ortigas", "", touched, "workCity")).toBe(false)
    expect(shouldWriteProfileField("Ortigas", null, touched, "workCity")).toBe(false)
    expect(shouldWriteProfileField(["Tagalog"], [], touched, "language")).toBe(false)
  })

  it("only affects the fields it names", () => {
    expect(shouldWriteProfileField("Ortigas", "Makati", touched, "workCity")).toBe(true)
    expect(shouldWriteProfileField("Maria", "Marie", touched, "nickname")).toBe(false)
  })
})

describe("touchedFieldSet", () => {
  it("treats null, undefined and [] alike as 'nothing was edited'", () => {
    for (const input of [null, undefined, []] as const) {
      expect(shouldWriteProfileField("Ortigas", "Makati", touchedFieldSet(input), "workCity")).toBe(
        false
      )
    }
  })
})
