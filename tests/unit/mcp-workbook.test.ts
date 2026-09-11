import { describe, expect, it } from "vitest"
import * as XLSX from "xlsx"
import { extractDGroupWorkbookProposals, inspectWorkbook } from "@/lib/mcp/workbook"

function workbookBuffer() {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["DLeaders consolidation"], [], [], [],
    ["Final #", "Leader", "Contact number", "Schedule", "Final status"],
    ["1", "Ruth Reyes", "639171234567", "Sunday 7:00 PM - 9:00 PM", "Final master record"],
  ]), "Final DLeaders")
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Group membership"], [], [], [], ["Group leader", "Member", "Group type"], ["Ruth Reyes", "Maria Santos", "Women"],
  ]), "Group Membership")
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer
}

describe("DGroup workbook parsing", () => {
  it("detects report-style headers rather than assuming row one", async () => {
    const tables = await inspectWorkbook(workbookBuffer())
    expect(tables[0]).toMatchObject({ sheet: "Final DLeaders", headerRow: 5, headers: ["Final #", "Leader", "Contact number", "Schedule", "Final status"] })
  })

  it("keeps name-only roster data in review", async () => {
    const proposals = await extractDGroupWorkbookProposals(workbookBuffer())
    expect(proposals).toContainEqual(expect.objectContaining({ kind: "dgroup_leader_metadata", status: "Proposed", sourceRow: 6 }))
    expect(proposals).toContainEqual(expect.objectContaining({ kind: "roster_membership", status: "NeedsReview", sourceRow: 6 }))
  })
})
