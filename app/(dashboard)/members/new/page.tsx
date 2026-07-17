import type { Metadata } from "next"
import { MemberForm } from "../member-form"

export const metadata: Metadata = {
  title: "New Member",
}

export default async function NewMemberPage() {
  return <MemberForm />
}
