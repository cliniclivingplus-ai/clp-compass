// interpret/route.ts generates weekly_schedule (one entry per week: focus_theme,
// cause, actions[], milestone). The Client Guide's roadmap page is always a
// fixed 12-month / 4-quarter structure (Months 1-3, 4-6, 7-9, 10-12) — that's
// the template's own framing, independent of how many weeks a given coaching
// cycle actually generated. Weeks are mapped into their real quarter by
// week_number (~4 weeks/month); a quarter with no generated weeks yet is
// rendered as "not yet planned" rather than inventing content for it.
export type WeeklyPlan = {
  week_number: number
  focus_theme: string
  cause: string
  actions: string[]
  milestone?: string
}

export type RoadmapQuarter = {
  label: string
  monthRange: string
  macroGoal: string
  microGoals: string[]
  successLooksLike: string
  planned: boolean
}

const QUARTERS = [
  { label: 'Quarter 1', monthRange: 'Months 1–3', weekStart: 1, weekEnd: 12 },
  { label: 'Quarter 2', monthRange: 'Months 4–6', weekStart: 13, weekEnd: 24 },
  { label: 'Quarter 3', monthRange: 'Months 7–9', weekStart: 25, weekEnd: 36 },
  { label: 'Quarter 4', monthRange: 'Months 10–12', weekStart: 37, weekEnd: 48 },
] as const

export function reshapeRoadmapIntoQuarters(weeklySchedule: WeeklyPlan[] | null | undefined): RoadmapQuarter[] {
  const weeks = Array.isArray(weeklySchedule) ? [...weeklySchedule].sort((a, b) => a.week_number - b.week_number) : []

  return QUARTERS.map((q) => {
    const chunk = weeks.filter((w) => w.week_number >= q.weekStart && w.week_number <= q.weekEnd)
    if (chunk.length === 0) {
      return {
        label: q.label,
        monthRange: q.monthRange,
        macroGoal: 'Not yet planned — will be scoped with your coach in a future cycle.',
        microGoals: [],
        successLooksLike: '',
        planned: false,
      }
    }
    const last = chunk[chunk.length - 1]
    return {
      label: q.label,
      monthRange: q.monthRange,
      macroGoal: last.focus_theme,
      microGoals: chunk.flatMap((w) => w.actions ?? []).slice(0, 2),
      successLooksLike: last.milestone || 'Rechecked with your coach at the end of this quarter.',
      planned: true,
    }
  })
}
