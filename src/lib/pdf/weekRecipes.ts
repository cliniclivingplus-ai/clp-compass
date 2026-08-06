import type { DayMealSlot } from './ClientGuideDocument'
import type { BankRecipe, RecipeMatch } from './matchRecipes'

// The single source of truth for "which recipes does week N's slot show" —
// shared by every template (Classic's DashboardClient, Almanac, and any
// future one) so they can never silently disagree about a patient's real
// curated recipes. A per-week override wins, then the old plan-wide
// `manualRecipes` (from before per-week curation existed, kept so older
// roadmaps don't lose a coach's picks), then the top auto-detected matches.
export function curatedSlotIds(
  slot: DayMealSlot,
  weekNumber: number,
  weeklyManualRecipes: Record<number, Partial<Record<DayMealSlot, string[]>>>,
  manualRecipes: Partial<Record<DayMealSlot, string[]>>,
  weekMealMatches: Record<DayMealSlot, RecipeMatch[]>
): string[] {
  const weekRaw = weeklyManualRecipes[weekNumber]?.[slot]
  if (Array.isArray(weekRaw) && weekRaw.length) return weekRaw
  const legacyRaw = manualRecipes[slot]
  if (Array.isArray(legacyRaw) && legacyRaw.length) return legacyRaw
  return weekMealMatches[slot].map((m) => m.recipe.id)
}

export function getSlotRecipes(
  weekNumber: number,
  slots: readonly DayMealSlot[],
  weeklyManualRecipes: Record<number, Partial<Record<DayMealSlot, string[]>>>,
  manualRecipes: Partial<Record<DayMealSlot, string[]>>,
  weekMealMatches: Record<DayMealSlot, RecipeMatch[]>,
  recipeBank: BankRecipe[],
  pickedByLine: string
): { slot: DayMealSlot; matches: RecipeMatch[] }[] {
  return slots.map((slot) => {
    const chosenIds = curatedSlotIds(slot, weekNumber, weeklyManualRecipes, manualRecipes, weekMealMatches)
    const matches = chosenIds
      .map((id): RecipeMatch | null => {
        const auto = weekMealMatches[slot].find((m) => m.recipe.id === id)
        if (auto) return auto
        const recipe = recipeBank.find((r) => r.id === id)
        return recipe ? { recipe, why: pickedByLine } : null
      })
      .filter((m): m is RecipeMatch => !!m)
    return { slot, matches }
  })
}
