import { Skeleton } from "@/components/ui/skeleton"
export default function Loading() {
  return <div className="space-y-6 p-6" role="status" aria-label="Loading DGroup placement"><Skeleton className="h-8 w-60" /><Skeleton className="h-10 w-80 max-w-full" /><Skeleton className="h-64 w-full" /></div>
}
