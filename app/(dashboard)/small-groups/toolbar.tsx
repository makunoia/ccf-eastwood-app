"use client"

import * as React from "react"
import Link from "next/link"
import { IconDownload, IconExternalLink, IconPlus, IconUpload } from "@tabler/icons-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ImportWizard } from "@/components/import/import-wizard"
import { checkSmallGroupDuplicates, checkSmallGroupLeaders, importSmallGroups, loadMembersForLeaderSearch } from "./import-actions"
import { exportSmallGroupsCSV, type SmallGroupExportRow } from "@/lib/export-entities"
import type { SmallGroupRow } from "./columns"

function toExportRow(g: SmallGroupRow): SmallGroupExportRow {
  return {
    name: g.name,
    status: g.status,
    leaderFirstName: g.leaderFirstName,
    leaderLastName: g.leaderLastName,
    leaderEmail: g.leaderEmail,
    leaderMobile: g.leaderPhone,
    parentGroupName: g.parentGroupName,
    lifeStage: g.lifeStage,
    genderFocus: g.genderFocus,
    language: g.language,
    ageRangeMin: g.ageRangeMin,
    ageRangeMax: g.ageRangeMax,
    meetingFormat: g.meetingFormat,
    locationCity: g.locationCity,
    memberLimit: g.memberLimit,
    memberCount: g.memberCount,
    scheduleDayOfWeek: g.scheduleDayOfWeek,
    scheduleTimeStart: g.scheduleTimeStart,
    scheduleTimeEnd: g.scheduleTimeEnd,
  }
}

type Props = {
  groups: SmallGroupRow[]
  canImport: boolean
  canExport: boolean
}

export function SmallGroupsToolbar({ groups, canImport, canExport }: Props) {
  const [importOpen, setImportOpen] = React.useState(false)

  function handleExport() {
    if (groups.length === 0) {
      toast.error("Nothing to export — list is empty.")
      return
    }
    exportSmallGroupsCSV(groups.map(toExportRow))
    toast.success(`Exported ${groups.length} small group${groups.length === 1 ? "" : "s"}.`)
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" asChild>
        <Link href="/small-group-confirmation" target="_blank">
          <IconExternalLink className="size-4" />
          <span className="hidden sm:inline">Confirmation Form</span>
        </Link>
      </Button>

      {canExport && (
        <Button variant="outline" onClick={handleExport} disabled={groups.length === 0}>
          <IconDownload className="size-4" />
          <span className="hidden sm:inline">Export</span>
        </Button>
      )}

      {canImport && (
        <Button variant="outline" onClick={() => setImportOpen(true)}>
          <IconUpload className="size-4" />
          <span className="hidden sm:inline">Import</span>
        </Button>
      )}

      <Button asChild>
        <Link href="/small-groups/new">
          <IconPlus />
          <span className="hidden sm:inline">Add Group</span>
        </Link>
      </Button>

      <ImportWizard
        config={{ entity: "small-group" }}
        open={importOpen}
        onOpenChange={setImportOpen}
        onCheckDuplicates={(rows) => checkSmallGroupDuplicates(rows)}
        onCheckLeaders={(rows) => checkSmallGroupLeaders(rows)}
        onLoadMembers={() => loadMembersForLeaderSearch()}
        onImport={(rows) => importSmallGroups(rows)}
      />
    </div>
  )
}
