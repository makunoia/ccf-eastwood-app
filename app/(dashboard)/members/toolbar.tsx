"use client"

import * as React from "react"
import { IconDownload, IconPlus, IconUpload } from "@tabler/icons-react"
import { toast } from "sonner"
import { PageActions, type PageAction } from "@/components/page-header"
import { ImportWizard } from "@/components/import/import-wizard"
import { checkMemberDuplicates, importMembers } from "./import-actions"
import { exportMembersCSV, type MemberExportRow } from "@/lib/export-entities"
import type { MemberRow } from "./columns"

function toExportRow(m: MemberRow): MemberExportRow {
  return {
    firstName: m.firstName,
    lastName: m.lastName,
    nickname: m.nickname,
    email: m.email,
    phone: m.phone,
    address: m.address,
    dateJoined: m.dateJoined,
    smallGroupName: m.smallGroupName,
    lifeStage: m.lifeStage,
    gender: m.gender,
    language: m.language,
    birthMonth: m.birthMonth,
    birthYear: m.birthYear,
    workCity: m.workCity,
    workIndustry: m.workIndustry,
    meetingPreference: m.meetingPreference,
    notes: m.notes,
  }
}

type Props = {
  members: MemberRow[]
  canImport: boolean
  canExport: boolean
}

export function MembersToolbar({ members, canImport, canExport }: Props) {
  const [importOpen, setImportOpen] = React.useState(false)

  function handleExport() {
    if (members.length === 0) {
      toast.error("Nothing to export — list is empty.")
      return
    }
    exportMembersCSV(members.map(toExportRow))
    toast.success(`Exported ${members.length} member${members.length === 1 ? "" : "s"}.`)
  }

  const actions: PageAction[] = [
    ...(canExport
      ? [{
          label: "Export",
          icon: <IconDownload className="size-4" />,
          onSelect: handleExport,
          disabled: members.length === 0,
        }]
      : []),
    ...(canImport
      ? [{
          label: "Import",
          icon: <IconUpload className="size-4" />,
          onSelect: () => setImportOpen(true),
        }]
      : []),
  ]

  return (
    <PageActions
      primary={{
        label: "Add Member",
        icon: <IconPlus />,
        href: "/members/new",
      }}
      actions={actions}
    >
      <ImportWizard
        config={{ entity: "member", useExistingEnriches: true, detectSharedContacts: true }}
        open={importOpen}
        onOpenChange={setImportOpen}
        onCheckDuplicates={checkMemberDuplicates}
        onImport={(rows) => importMembers(rows)}
      />
    </PageActions>
  )
}
