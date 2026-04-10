export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-muted min-h-svh flex flex-col items-center justify-center p-6 md:p-10">
      {children}
    </div>
  )
}
