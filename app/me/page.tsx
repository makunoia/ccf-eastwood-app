import { IconUserCircle } from "@tabler/icons-react"
import { VerifyForm } from "./verify-form"
import { FormClosed } from "@/components/form-closed"
import { getFormConfig } from "@/lib/forms/config"

export default async function MePage() {
  const formConfig = await getFormConfig("MemberSelfService")
  if (!formConfig.isOpen) return <FormClosed />

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="rounded-full bg-primary/10 p-3">
              <IconUserCircle className="size-6 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-semibold">My Small Groups</h1>
          <p className="text-sm text-muted-foreground">
            Enter your mobile number to view and manage your small group
          </p>
        </div>
        <VerifyForm />
      </div>
    </div>
  )
}
