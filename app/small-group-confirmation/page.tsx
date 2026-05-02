import { IconUsers } from "@tabler/icons-react"
import { VerifyForm } from "./verify-form"

export default function SmallGroupConfirmationEntryPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="rounded-full bg-primary/10 p-3">
              <IconUsers className="size-6 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-semibold">Member Confirmation</h1>
          <p className="text-sm text-muted-foreground">
            Enter your mobile number to view your pending member requests
          </p>
        </div>
        <VerifyForm />
      </div>
    </div>
  )
}
