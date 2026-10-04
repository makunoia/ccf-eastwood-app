export function sessionRsvpStats(expectedRegistrantIds: string[], presentRegistrantIds: string[]) {
  const expectedIds = new Set(expectedRegistrantIds)
  const presentIds = new Set(presentRegistrantIds)
  const expected = expectedIds.size
  const checkedIn = [...expectedIds].filter((id) => presentIds.has(id)).length
  return { expected, checkedIn, notCheckedIn: expected - checkedIn, rate: expected ? checkedIn / expected : null }
}
