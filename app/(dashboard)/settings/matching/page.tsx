import { db } from "@/lib/db"
import { MatchingContext } from "@/app/generated/prisma/client"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { type MatchingWeightsFormValues } from "@/lib/validations/matching-weights"
import { MatchingWeightsForm } from "./matching-weights-form"

async function getWeights(context: MatchingContext): Promise<MatchingWeightsFormValues | null> {
  const row = await db.matchingWeightConfig.findUnique({ where: { context } })
  if (!row) return null
  return {
    lifeStage: row.lifeStage,
    gender: row.gender,
    language: row.language,
    age: row.age,
    schedule: row.schedule,
    location: row.location,
    mode: row.mode,
    career: row.career,
    capacity: row.capacity,
  }
}

export default async function MatchingWeightsPage() {
  const [smallGroupWeights, breakoutWeights] = await Promise.all([
    getWeights(MatchingContext.SmallGroup),
    getWeights(MatchingContext.Breakout),
  ])

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h2 className="text-xl font-semibold">Matching Weights</h2>
        <p className="text-sm text-muted-foreground">
          Tune the scoring weights used to suggest small group and breakout group assignments.
          All weights must sum to <span className="font-mono font-medium">1.000</span>.
        </p>
      </div>

      <Tabs defaultValue="small-group">
        <TabsList>
          <TabsTrigger value="small-group">Small Group</TabsTrigger>
          <TabsTrigger value="breakout">Breakout</TabsTrigger>
        </TabsList>

        <TabsContent value="small-group" className="mt-6">
          <MatchingWeightsForm
            context={MatchingContext.SmallGroup}
            initial={smallGroupWeights}
          />
        </TabsContent>

        <TabsContent value="breakout" className="mt-6">
          <MatchingWeightsForm
            context={MatchingContext.Breakout}
            initial={breakoutWeights}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
