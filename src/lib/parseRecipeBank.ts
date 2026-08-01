// Bulk recipe-bank import format — plain text, one recipe per block,
// separated by a line starting with "###". Designed so a coach can type this
// straight into Word/Notepad (or paste into either) without any special
// formatting, then upload the whole file to add 100+ recipes at once instead
// of one form submission at a time.
//
// ### Recipe name
// Meal: breakfast
// Protein: ~15g protein
// Tags: gut-health, quick
// Ingredients:
// - moong sprouts
// - moringa leaves
// - besan
// Steps:
// 1. Soak sprouts overnight.
// 2. Blend with besan and spices.
// 3. Cook on a tawa like a cheela.
export const RECIPE_IMPORT_TEMPLATE = `### Sprouts Moringa Cheela
Meal: breakfast
Protein: ~15g protein
Tags: gut-health, quick
Ingredients:
- Moong sprouts, 1 cup
- Moringa leaves, a handful
- Besan (gram flour), 2 tbsp
- Salt, cumin, green chili to taste
Steps:
1. Blend sprouts, moringa leaves, besan, and spices with a little water into a thick batter.
2. Heat a tawa with a few drops of oil.
3. Pour a ladle of batter, spread thin, cook 2 minutes each side until golden.

### Vegetable Khichdi
Meal: lunch
Protein: ~10g protein
Tags: comfort, one-pot
Ingredients:
- Moong dal, 1/2 cup
- Rice, 1/2 cup
- Mixed vegetables, 1 cup
- Turmeric, salt, ghee
Steps:
1. Wash dal and rice together, add double the water.
2. Add chopped vegetables, turmeric, and salt.
3. Pressure cook 3-4 whistles, finish with a spoon of ghee.
`

export type ParsedRecipe = {
  name: string
  meal_type: string
  protein_label: string
  ingredients: string
  steps: string
  tags: string[]
}

export type RecipeImportResult = {
  recipes: ParsedRecipe[]
  errors: { block: number; reason: string }[]
}

const VALID_MEAL_TYPES = new Set(['breakfast', 'lunch', 'dinner', 'snack'])

export function parseRecipeBankText(raw: string): RecipeImportResult {
  const recipes: ParsedRecipe[] = []
  const errors: { block: number; reason: string }[] = []

  const lines = raw.split(/\r?\n/)
  // Anchor on "Meal:" lines rather than requiring a literal "###" marker —
  // a coach pasting recipes copied from elsewhere (e.g. straight out of this
  // app's own recipe list) won't have added "###", and every real recipe
  // block reliably has exactly one "Meal:" line, so it's a more forgiving
  // anchor than a marker that has to be typed by hand.
  const mealLineIdx: number[] = []
  lines.forEach((line, i) => { if (/^meal:\s*\S/i.test(line.trim())) mealLineIdx.push(i) })

  if (!mealLineIdx.length) {
    errors.push({ block: 1, reason: 'No "Meal:" line found anywhere in the file — check the file matches the format (each recipe needs a line like "Meal: breakfast").' })
    return { recipes, errors }
  }

  // The recipe name is whatever non-blank line sits right before its
  // "Meal:" line (an optional leading "###" is stripped if present, so the
  // original marker-based format still works unchanged).
  const nameIdxForAnchor = mealLineIdx.map((mealIdx) => {
    let idx = mealIdx - 1
    while (idx >= 0 && !lines[idx].trim()) idx--
    return idx
  })

  mealLineIdx.forEach((mealIdx, i) => {
    const nameIdx = nameIdxForAnchor[i]
    const name = nameIdx >= 0 ? lines[nameIdx].trim().replace(/^#{1,3}\s*/, '') : ''
    if (!name) { errors.push({ block: i + 1, reason: 'Missing recipe name on the line before "Meal:"' }); return }

    const blockStart = nameIdx + 1
    const blockEnd = i + 1 < nameIdxForAnchor.length ? nameIdxForAnchor[i + 1] : lines.length
    const blockLines = lines.slice(blockStart, blockEnd)

    let mealType = ''
    let proteinLabel = ''
    let tags: string[] = []
    let section: 'ingredients' | 'steps' | null = null
    const ingredientLines: string[] = []
    const stepLines: string[] = []

    for (const line of blockLines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const mealMatch = trimmed.match(/^meal:\s*(.+)$/i)
      const proteinMatch = trimmed.match(/^protein:\s*(.+)$/i)
      const tagsMatch = trimmed.match(/^tags:\s*(.+)$/i)
      if (mealMatch) { mealType = mealMatch[1].trim().toLowerCase(); continue }
      if (proteinMatch) { proteinLabel = proteinMatch[1].trim(); continue }
      if (tagsMatch) { tags = tagsMatch[1].split(',').map((t) => t.trim().toLowerCase()).filter(Boolean); continue }
      if (/^ingredients:?\s*$/i.test(trimmed)) { section = 'ingredients'; continue }
      if (/^steps:?\s*$/i.test(trimmed)) { section = 'steps'; continue }
      if (section === 'ingredients') ingredientLines.push(trimmed.replace(/^[-•\s]+/, ''))
      else if (section === 'steps') stepLines.push(trimmed.replace(/^\d+[.)]\s*/, ''))
    }

    if (!VALID_MEAL_TYPES.has(mealType)) { errors.push({ block: i + 1, reason: `"${name}": Meal must be breakfast, lunch, dinner, or snack (got "${mealType || 'none'}")` }); return }
    if (!ingredientLines.length) { errors.push({ block: i + 1, reason: `"${name}": No ingredients found` }); return }
    if (!stepLines.length) { errors.push({ block: i + 1, reason: `"${name}": No steps found` }); return }

    recipes.push({
      name,
      meal_type: mealType,
      protein_label: proteinLabel,
      ingredients: ingredientLines.join('\n'),
      steps: stepLines.join('\n'),
      tags,
    })
  })

  return { recipes, errors }
}
