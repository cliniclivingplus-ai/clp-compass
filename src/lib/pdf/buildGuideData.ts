import type { GuideData, Coach, DayMealSlot } from './ClientGuideDocument'
import type { GuideImage } from './matchGuideImage'
import type { BankRecipe } from './matchRecipes'

// Shared by the editable preview page and the PDF download route, so both
// always resolve the same content the same way (WYSIWYG) — guide_overrides
// wins over the derived defaults when a coach has explicitly edited a field.
export type RoadmapRow = {
  overview: string | null
  lifestyle_guidelines: string | null
  nutritionist_guidelines: string | null
  kb_sources: GuideData['roadmap']['kb_sources'] | null
  weekly_schedule: GuideData['roadmap']['weekly_schedule'] | null
  duration_months: number
  guide_overrides: { goal_label?: string; why_reflection?: string; coach_quote?: string; manual_recipes?: Partial<Record<DayMealSlot, string[]>>; theme?: string } | null
  patients: (Omit<GuideData['patient'], never> & { nutritionists: Coach | null }) | null
  sessions: { case_summary: { goal?: string; coach_quote?: string } | null } | null
}

export function buildGuideData(roadmap: RoadmapRow, imageBank: GuideImage[] = [], recipeBank: BankRecipe[] = []): GuideData {
  const overrides = roadmap.guide_overrides ?? {}
  // Priority: coach's manual edit > the AI's motivating one-liner from the
  // case summary > the raw problem statement, as a last resort for sessions
  // generated before the "goal" field existed.
  const goalLabel = overrides.goal_label
    || roadmap.sessions?.case_summary?.goal
    || roadmap.patients?.primary_concern
    || 'Feeling like yourself again'
  return {
    patient: roadmap.patients as GuideData['patient'],
    coach: roadmap.patients?.nutritionists ?? null,
    roadmap: {
      overview: roadmap.overview ?? '',
      lifestyle_guidelines: roadmap.lifestyle_guidelines ?? '',
      nutritionist_guidelines: roadmap.nutritionist_guidelines ?? '',
      kb_sources: roadmap.kb_sources ?? [],
      weekly_schedule: roadmap.weekly_schedule ?? [],
      duration_months: roadmap.duration_months,
    },
    goalLabel,
    whyReflection: overrides.why_reflection || (roadmap.overview ?? '').split('\n\n')[0] || goalLabel,
    coachQuote: overrides.coach_quote || roadmap.sessions?.case_summary?.coach_quote || '',
    imageBank,
    recipeBank,
    manualRecipes: overrides.manual_recipes ?? {},
    theme: overrides.theme || 'classic',
  }
}
