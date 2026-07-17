import type { Metadata } from "next"
import { GuestForm } from "../guest-form"

export const metadata: Metadata = {
  title: "New Guest",
}

export default async function NewGuestPage() {
  return <GuestForm />
}
