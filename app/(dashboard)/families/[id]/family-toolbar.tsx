"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { IconPencil, IconTrash } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { PageActions } from "@/components/page-header"
import { deleteFamily } from "../actions"
import { FamilyFormDialog } from "../family-form-dialog"

export function FamilyToolbar({
  family,
}: {
  family: { id: string; name: string; notes: string | null }
}) {
  const router = useRouter()
  const [editOpen, setEditOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  async function handleDelete() {
    setDeleting(true)
    const result = await deleteFamily(family.id)
    setDeleting(false)
    if (result.success) {
      toast.success("Family deleted")
      router.push("/families")
    } else {
      toast.error(result.error)
    }
  }

  return (
    <PageActions
      primary={{
        label: "Edit Family",
        icon: <IconPencil />,
        onSelect: () => setEditOpen(true),
      }}
      actions={[
        {
          label: "Delete Family",
          icon: <IconTrash />,
          onSelect: () => setDeleteOpen(true),
          overflow: true,
        },
      ]}
    >
      <FamilyFormDialog open={editOpen} onOpenChange={setEditOpen} family={family} />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete family</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium">{family.name}</span>? Its members and
              guests are kept — only the family grouping is removed. This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageActions>
  )
}
