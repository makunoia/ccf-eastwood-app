export type VolunteerAssignmentProfile = {
  id: string
  ageGroup: string | null
  lifeStageId: string | null
}

/**
 * Narrow an already-authorized volunteer pool for a facilitator slot.
 * Empty filters intentionally retain volunteers whose profiles are incomplete.
 */
export function filterVolunteerAssignmentPool<T extends VolunteerAssignmentProfile>(
  volunteers: T[],
  filters: { ageGroup: string; lifeStageId: string }
): T[] {
  return volunteers.filter((volunteer) =>
    (!filters.ageGroup || volunteer.ageGroup === filters.ageGroup) &&
    (!filters.lifeStageId || volunteer.lifeStageId === filters.lifeStageId)
  )
}
