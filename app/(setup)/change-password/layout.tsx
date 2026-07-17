import type { Metadata } from "next"

// The page itself is a client component and cannot export metadata.
export const metadata: Metadata = {
  title: "Change Password",
}

export default function ChangePasswordLayout({ children }: { children: React.ReactNode }) {
  return children
}
