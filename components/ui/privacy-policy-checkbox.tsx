"use client"

import * as React from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type Props = {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

export function PrivacyPolicyCheckbox({ checked, onCheckedChange }: Props) {
  const [open, setOpen] = React.useState(false)
  const id = React.useId()

  return (
    <>
      <div className="flex items-start gap-2">
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={(v) => onCheckedChange(!!v)}
          className="mt-0.5"
        />
        <Label htmlFor={id} className="text-sm leading-snug cursor-pointer font-normal">
          I agree to{" "}
          <button
            type="button"
            className="underline underline-offset-2 font-medium hover:text-foreground/70 transition-colors"
            onClick={(e) => {
              e.preventDefault()
              setOpen(true)
            }}
          >
            CCF Privacy Policy
          </button>
        </Label>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>CCF Privacy Policy</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Upon accomplishing this form, you agree and confirm that all information that you have
            provided herein has been given by you with your express and informed consent and may be
            handled by CCF in accordance with CCF&apos;s{" "}
            <a
              href="https://www.ccf.org.ph/privacy-policy/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 font-medium text-foreground hover:text-foreground/70 transition-colors"
            >
              Privacy Policy
            </a>
            , and should there any be concern with regard to the handling of your information, that
            you will first bring the same to the attention of CCF for proper remediation at{" "}
            <a
              href="mailto:privacy@ccf.org.ph"
              className="underline underline-offset-2 font-medium text-foreground hover:text-foreground/70 transition-colors"
            >
              privacy@ccf.org.ph
            </a>
            .
          </p>
        </DialogContent>
      </Dialog>
    </>
  )
}
