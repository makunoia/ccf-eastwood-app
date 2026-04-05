"use client"

import { IconPrinter } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"

type Passenger = {
  id: string
  name: string
  mobile: string | null
  type: "Member" | "Guest" | "Volunteer"
}

type Props = {
  busName: string
  direction: string
  capacity: number | null
  eventName: string
  eventDate: string
  ministry: string
  passengers: Passenger[]
}

export function ManifestPrint({
  busName,
  direction,
  capacity,
  eventName,
  eventDate,
  ministry,
  passengers,
}: Props) {
  return (
    <>
      {/* Print button — hidden when printing */}
      <div className="flex justify-end gap-2 p-4 print:hidden">
        <Button onClick={() => window.print()}>
          <IconPrinter className="mr-2 size-4" />
          Print / Save as PDF
        </Button>
      </div>

      {/* Manifest content */}
      <div className="mx-auto max-w-2xl px-8 py-6 print:max-w-none print:px-0 print:py-0">
        {/* Header */}
        <div className="mb-6 border-b pb-4">
          <h1 className="text-2xl font-bold">{busName}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {direction} · {eventName}
          </p>
          <p className="text-sm text-muted-foreground">
            {ministry} · {eventDate}
          </p>
          <p className="text-sm mt-2">
            <span className="font-medium">{passengers.length}</span> passengers
            {capacity != null && (
              <span className="text-muted-foreground"> / {capacity} capacity</span>
            )}
          </p>
        </div>

        {/* Passenger list */}
        {passengers.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No passengers assigned to this bus.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 text-left font-semibold w-8">#</th>
                <th className="py-2 text-left font-semibold">Name</th>
                <th className="py-2 text-left font-semibold">Mobile</th>
                <th className="py-2 text-left font-semibold">Type</th>
                <th className="py-2 text-left font-semibold w-16 print:block hidden">✓</th>
              </tr>
            </thead>
            <tbody>
              {passengers.map((p, i) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="py-2.5 text-muted-foreground">{i + 1}</td>
                  <td className="py-2.5 font-medium">{p.name}</td>
                  <td className="py-2.5 text-muted-foreground">{p.mobile ?? "—"}</td>
                  <td className="py-2.5 text-muted-foreground">{p.type}</td>
                  <td className="py-2.5 print:block hidden" />
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Footer */}
        <div className="mt-8 pt-4 border-t text-xs text-muted-foreground print:mt-16">
          <p>Printed on {new Date().toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })}</p>
        </div>
      </div>

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          @page {
            margin: 1.5cm;
          }
          body {
            font-size: 12pt;
          }
        }
      `}</style>
    </>
  )
}
