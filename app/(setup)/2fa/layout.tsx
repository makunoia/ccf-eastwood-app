import type { Metadata } from "next"

// The page itself is a client component and cannot export metadata.
export const metadata: Metadata = {
  title: "Set Up Two-Factor",
}

export default function TwoFactorLayout({ children }: { children: React.ReactNode }) {
  return children
}
