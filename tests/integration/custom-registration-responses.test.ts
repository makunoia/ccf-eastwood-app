import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { db } from "@/lib/db"
import { createRegistrant } from "@/app/(dashboard)/events/actions"

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "EventRegistrant", "EventFormConfig", "Guest", "Event" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function makeEvent() {
  const event = await db.event.create({
    data: {
      name: "Custom Questions Test",
      type: "OneTime",
      startDate: new Date("2026-09-24"),
      endDate: new Date("2026-09-24"),
    },
  })
  await db.eventFormConfig.create({
    data: {
      eventId: event.id,
      context: "Register",
      customSteps: [{
        id: "step-1",
        title: "Preferences",
        questions: [
          { id: "q-1", label: "Preferred session?", type: "SingleChoice", required: true, options: ["Morning", "Evening"] },
        ],
      }],
    },
  })
  return event.id
}

describe("custom registration response persistence", () => {
  it("rejects missing required answers and invalid choices before creating a registration", async () => {
    const eventId = await makeEvent()
    const missing = await createRegistrant(eventId, { firstName: "Ana", lastName: "Cruz" }, null)
    const invalid = await createRegistrant(eventId, {
      firstName: "Ana", lastName: "Cruz", customResponses: [{ questionId: "q-1", answer: "Afternoon" }],
    }, null)

    expect(missing.success).toBe(false)
    expect(invalid.success).toBe(false)
    expect(await db.eventRegistrant.count()).toBe(0)
  })

  it("stores the submitted value with the question label snapshot", async () => {
    const eventId = await makeEvent()
    const result = await createRegistrant(eventId, {
      firstName: "Ana",
      lastName: "Cruz",
      customResponses: [{ questionId: "q-1", answer: "Morning" }],
    }, null)

    expect(result.success).toBe(true)
    const registrant = await db.eventRegistrant.findFirst({ where: { eventId } })
    expect(registrant?.customResponses).toEqual([
      { context: "Register", questionId: "q-1", label: "Preferred session?", answer: "Morning" },
    ])

    await db.eventFormConfig.update({
      where: { eventId_context: { eventId, context: "Register" } },
      data: { customSteps: [] },
    })
    const afterQuestionRemoval = await db.eventRegistrant.findFirst({ where: { eventId } })
    expect(afterQuestionRemoval?.customResponses).toEqual(registrant?.customResponses)
  })
})
