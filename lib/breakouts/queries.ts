import "server-only"

/**
 * The shape a breakout-groups *list* needs: who runs each table, what it matches
 * for, its schedule, and its headcount.
 *
 * Shared because two workspaces render the same table now (CCF-148) — an event's
 * standing groups at `/event/[id]/breakouts`, and a Collab cluster's groups for
 * the day at `/cluster/[id]/breakouts`. It lived inline on the event page, and
 * duplicating it would let the two pages drift into rendering different columns
 * from the same component.
 */
export const breakoutGroupsInclude = {

  // Same tie as the picker's own ordering: `createdAt` is a `TIMESTAMP(3)`, and
  // tables made in one go share a millisecond, so a list keyed on it alone
  // reshuffles those rows between page loads. `id` asc settles it in creation
  // order.
  orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
  include: {
    facilitator: {
      include: {
        member: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            ledGroups: {
              select: {
                id: true,
                name: true,
                lifeStages: { select: { id: true } },
                genderFocus: true,
                language: true,
                ageRangeMin: true,
                ageRangeMax: true,
                meetingFormat: true,
                locationCity: true,
                scheduleDayOfWeek: true,
                scheduleTimeStart: true,
                scheduleTimeEnd: true,
              },
            },
          },
        },
      },
    },
    coFacilitator: {
      include: {
        member: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            ledGroups: {
              select: {
                id: true,
                name: true,
                lifeStages: { select: { id: true } },
                genderFocus: true,
                language: true,
                ageRangeMin: true,
                ageRangeMax: true,
                meetingFormat: true,
                locationCity: true,
                scheduleDayOfWeek: true,
                scheduleTimeStart: true,
                scheduleTimeEnd: true,
              },
            },
          },
        },
      },
    },
    linkedSmallGroup: {
      select: { id: true, name: true },
    },
    lifeStages: { select: { id: true, name: true }, orderBy: { order: "asc" as const } },
    schedules: { select: { dayOfWeek: true, timeStart: true, timeEnd: true } },
    _count: { select: { members: true } },
  },
}
