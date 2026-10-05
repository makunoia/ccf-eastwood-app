export function sessionRegistrationStats(expectedRegistrantIds: string[], presentRegistrantIds: string[]) {
  const expectedIds = new Set(expectedRegistrantIds)
  const presentIds = new Set(presentRegistrantIds)
  const expected = expectedIds.size
  const checkedIn = [...expectedIds].filter((id) => presentIds.has(id)).length
  return { expected, checkedIn, notCheckedIn: expected - checkedIn, rate: expected ? checkedIn / expected : null }
}

/** Session registrations and arrivals form one pool, with each person counted once. */
export function sessionTurnoutStats(registeredPersonKeys: string[], checkedInPersonKeys: string[]) {
  const registered = new Set(registeredPersonKeys)
  const checkedIn = new Set(checkedInPersonKeys)
  const total = new Set([...registered, ...checkedIn]).size
  return { total, checkedIn: checkedIn.size, notCheckedIn: total - checkedIn.size, rate: total ? checkedIn.size / total : null }
}
