"use client"

import * as React from "react"
import { IconDownload, IconExternalLink, IconPlus, IconUpload } from "@tabler/icons-react"
import { toast } from "sonner"
import { PageActions, type PageAction } from "@/components/page-header"
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

  const actions: PageAction[] = [
    {
      label: "Confirmation Form",
      icon: <IconExternalLink className="size-4" />,
      href: "/small-group-confirmation",
      newTab: true,
    },
    ...(canExport
      ? [{
          label: "Export",
          icon: <IconDownload className="size-4" />,
          onSelect: handleExport,
          disabled: groups.length === 0,
          overflow: true,
        }]
      : []),
    ...(canImport
      ? [{
          label: "Import",
          icon: <IconUpload className="size-4" />,
          onSelect: () => setImportOpen(true),
          overflow: true,
        }]
      : []),
  ]

  return (
    <PageActions
      primary={{
        label: "Add Group",
        icon: <IconPlus />,
        href: "/small-groups/new",
      }}
      actions={actions}
    >
      <ImportWizard
        config={{ entity: "small-group", useExistingEnriches: true }}
        open={importOpen}
        onOpenChange={setImportOpen}
        onCheckDuplicates={(rows) => checkSmallGroupDuplicates(rows)}
        onCheckLeaders={(rows) => checkSmallGroupLeaders(rows)}
        onLoadMembers={() => loadMembersForLeaderSearch()}
        onImport={(rows) => importSmallGroups(rows)}
      />
    </PageActions>
  )
}
