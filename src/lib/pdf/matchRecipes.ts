// Selects recipes from the coach-built recipe bank for a specific patient's
// guide — grounded only in real signals already in their data (their stated
// concern, and the diet-protocol bullets the AI clinical step generated for
// them), never a generic fixed list. A recipe only gets included if it
// actually matches one of those real terms; the "why" quotes the matched
// term back, the same grounding discipline used for coach_quote elsewhere in
// this app (never invent a connection that isn't really there).
//
// Note: recipes have no calorie data (the source cookbooks don't reliably
// include it, and fabricating a number would be worse than omitting one) —
// selection is concern/diet-protocol relevance only, not calorie-based.
export type BankRecipe = {
  id: string
  name: string
  meal_type: string
  protein_label: string | null
  ingredients: string
  steps: string
  tags: string[]
  // Optional "facts" fields, only present when a coach's source (e.g. a
  // Canva recipe card) actually had them — never fabricated. A recipe
  // missing all of these still renders fine; the dashboard just omits the
  // facts/tools/notes sections for it instead of showing a placeholder.
  eat_time?: string | null
  prep_time?: string | null
  cook_time?: string | null
  difficulty?: string | null
  health_score?: string | null
  servings?: string | null
  tools?: string[]
  notes?: string[]
  benefits?: string[]
  image_url?: string | null // coach's own photo for this recipe — takes priority over the tag-matched picture bank
}
export type RecipeMatch = { recipe: BankRecipe; why: string }

const STOP_WORDS = new Set([
  'the', 'and', 'with', 'your', 'this', 'that', 'from', 'for', 'you', 'are', 'was', 'her', 'his', 'their',
  'have', 'has', 'been', 'they', 'she', 'him', 'but', 'not', 'all', 'can', 'will', 'more', 'also', 'into',
])

function extractKeywords(text: string): string[] {
  return [...new Set(
    (text || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/)
      .filter((w) => w.length > 3 && !STOP_WORDS.has(w))
  )]
}

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack', 'dessert'] as const

export function selectRecipesForPatient(
  opts: { primaryConcern: string; dietProtocol: string[] },
  bank: BankRecipe[],
  perMealLimit = 2
): Record<(typeof MEAL_TYPES)[number], RecipeMatch[]> {
  const concernKeywords = extractKeywords(opts.primaryConcern)
  const dietKeywords = opts.dietProtocol.flatMap(extractKeywords)
  const keywords = [...new Set([...concernKeywords, ...dietKeywords])]

  const result = {} as Record<(typeof MEAL_TYPES)[number], RecipeMatch[]>
  for (const meal of MEAL_TYPES) {
    const scored = bank
      .filter((r) => r.meal_type === meal)
      .map((r) => {
        const haystack = `${r.name} ${r.tags.join(' ')} ${r.ingredients}`.toLowerCase()
        const matched = keywords.filter((k) => new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(haystack))
        return { recipe: r, matched }
      })
      .filter((s) => s.matched.length > 0)
      .sort((a, b) => b.matched.length - a.matched.length)

    result[meal] = scored.slice(0, perMealLimit).map((s) => ({
      recipe: s.recipe,
      why: opts.primaryConcern && concernKeywords.some((k) => s.matched.includes(k))
        ? `Chosen for your plan, it fits what your coach noted about "${s.matched.find((m) => concernKeywords.includes(m))}."`
        : `Chosen for your plan, it matches your care team's diet notes on "${s.matched[0]}."`,
    }))
  }
  return result
}
