export const CATCH_MECH_ELIGIBILITY_ERROR = "One or more participants are no longer eligible. Refresh the choices and review your selection."

export function catchMechEmptyMessage(oneTime: boolean) {
  return oneTime
    ? "No eligible participants. Catch Mech shows attendees who still need a DGroup."
    : "No eligible participants. Catch Mech shows returning attendees who still need a DGroup."
}
