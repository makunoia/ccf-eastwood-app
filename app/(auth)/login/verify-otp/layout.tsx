import type { Metadata } from "next"

// The page itself is a client component and cannot export metadata.
export const metadata: Metadata = {
  title: "Verify Code",
}

export default function VerifyOtpLayout({ children }: { children: React.ReactNode }) {
  return children
}
