"use client"

import * as React from "react"
import Link from "next/link"
import { IconDownload, IconPlus, IconUpload } from "@tabler/icons-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
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

  return (
    <div className="flex items-center gap-2">
      {canExport && (
        <Button variant="outline" onClick={handleExport} disabled={members.length === 0}>
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
        <Link href="/members/new">
          <IconPlus />
          <span className="hidden sm:inline">Add Member</span>
        </Link>
      </Button>

      <ImportWizard
        config={{ entity: "member", useExistingEnriches: true }}
        open={importOpen}
        onOpenChange={setImportOpen}
        onCheckDuplicates={checkMemberDuplicates}
        onImport={(rows) => importMembers(rows)}
      />
    </div>
  )
}
