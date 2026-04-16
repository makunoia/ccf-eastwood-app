import type { Metadata, Viewport } from "next"
import { Suspense } from "react"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { Toaster } from "sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { NavigationLoader } from "@/components/navigation-loader"
import "./globals.css"

export const metadata: Metadata = {
  title: "Churchie",
  description: "Church management for administrators",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Churchie",
  },
  formatDetection: {
    telephone: false,
  },
}

export const viewport: Viewport = {
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  themeColor: "#18181b",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}>
        <TooltipProvider>
          {children}
          <Toaster richColors position="top-right" />
          <Suspense>
            <NavigationLoader />
          </Suspense>
        </TooltipProvider>
      </body>
    </html>
  )
}
