import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { db } from "@/lib/db"
import { createRegistrant } from "@/app/(dashboard)/events/actions"
import { getEventCustomSteps } from "@/lib/forms/custom-steps-server"
import { saveCustomFormSteps } from "@/app/(dashboard)/events/form-config-actions"

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
  await db.event.update({
    where: { id: event.id },
    data: {
      customRegistrationSteps: [{
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

    await db.event.update({ where: { id: eventId }, data: { customRegistrationSteps: [] } })
    const afterQuestionRemoval = await db.eventRegistrant.findFirst({ where: { eventId } })
    expect(afterQuestionRemoval?.customResponses).toEqual(registrant?.customResponses)
  })

  it("uses the same shared question for Register and Walk-in submissions", async () => {
    const eventId = await makeEvent()
    expect(await getEventCustomSteps(eventId)).toMatchObject([
      { id: "step-1", questions: [{ id: "q-1", label: "Preferred session?" }] },
    ])

    const registered = await createRegistrant(eventId, {
      firstName: "Mia", lastName: "Reyes", customResponses: [{ questionId: "q-1", answer: "Morning" }],
    }, null)
    const walkIn = await createRegistrant(eventId, {
      firstName: "Lia", lastName: "Santos", customResponses: [{ questionId: "q-1", answer: "Evening" }],
    }, null, null, undefined, undefined, { occurrenceId: null })

    expect(registered.success).toBe(true)
    expect(walkIn.success).toBe(true)
    const snapshots = await db.eventRegistrant.findMany({ where: { eventId }, select: { customResponses: true } })
    expect(snapshots.flatMap((row) => row.customResponses as Array<{ context: string; questionId: string }>).map((answer) => answer.context).sort())
      .toEqual(["Register", "WalkIn"])
  })

  it("saves the shared definition from either form context", async () => {
    const eventId = await makeEvent()
    const replacement = [{
      id: "shared-step",
      title: "Arrival",
      questions: [{ id: "arrival-q", label: "How did you arrive?", type: "SingleChoice", required: false, options: ["Walk", "Drive"] }],
    }]
    const result = await saveCustomFormSteps(eventId, "WalkIn", replacement)

    expect(result.success).toBe(true)
    expect(await getEventCustomSteps(eventId)).toEqual(replacement)
    const formConfig = await db.eventFormConfig.findUnique({ where: { eventId_context: { eventId, context: "WalkIn" } } })
    expect(formConfig?.configuredAt).toBeInstanceOf(Date)
  })
})
