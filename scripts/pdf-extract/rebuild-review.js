#!/usr/bin/env node
// One-off utility: rebuilds output/recipes-ready-for-review.json from
// whatever's currently in output/recipes/*.json — useful when a batch was
// stopped partway through (Ctrl+C) and you want to review/import progress
// so far without waiting for or re-running the rest. Same merge/dedup logic
// as extract.js's own end-of-run step.
//
// Usage: node rebuild-review.js [--out ./output]

const fs = require('fs')
const path = require('path')

const args = process.argv.slice(2)
let outDir = path.join(__dirname, 'output')
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') { outDir = path.resolve(args[++i]); continue }
}

const VALID_MEAL_TYPES = new Set(['breakfast', 'lunch', 'dinner', 'snack', 'dessert'])

// Cleans up entries produced by older runs, before the current extract.js
// existed in its present form: array-typed ingredients/steps (an early AI
// response-shape bug, fixed since) get joined into the string format
// recipe_bank expects, and any meal_type the AI returned outside the app's
// actual allowed set (recipe_bank's CHECK constraint only allows
// breakfast/lunch/dinner/snack/dessert — a stray "soup" or "drinkable"
// would fail to import) falls back to a same keyword guess extract.js's
// own guessMealType() uses, never left blank.
function normalizeRecipe(r) {
  const hay = `${r.name || ''} ${Array.isArray(r.ingredients) ? r.ingredients.join(' ') : r.ingredients || ''}`.toLowerCase()
  let mealType = r.meal_type
  if (!VALID_MEAL_TYPES.has(mealType)) {
    if (/dessert|sweet treat|brownie|cookie|cake|ice cream/.test(hay)) mealType = 'dessert'
    else if (/breakfast/.test(hay)) mealType = 'breakfast'
    else if (/\bsoup\b|\bsnack/.test(hay)) mealType = 'snack'
    else if (/\blunch\b/.test(hay)) mealType = 'lunch'
    else if (/\bdinner\b/.test(hay)) mealType = 'dinner'
    else mealType = 'snack'
  }
  return {
    ...r,
    meal_type: mealType,
    ingredients: Array.isArray(r.ingredients) ? r.ingredients.join('\n') : r.ingredients,
    steps: Array.isArray(r.steps) ? r.steps.join('\n') : r.steps,
  }
}

function normalizeName(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function dedupeAcrossFiles(allRecipes) {
  const byName = new Map()
  for (const r of allRecipes) {
    const key = normalizeName(r.name)
    if (!key) continue
    const completeness = (r.ingredients || '').length + (r.steps || '').length
    const existing = byName.get(key)
    if (!existing) {
      byName.set(key, { ...r, _sources: [{ file: r._sourceFile, page: r._sourcePage }], _completeness: completeness })
      continue
    }
    existing._sources.push({ file: r._sourceFile, page: r._sourcePage })
    if (completeness > existing._completeness) {
      const sources = existing._sources
      byName.set(key, { ...r, _sources: sources, _completeness: completeness })
    }
  }
  return [...byName.values()].map(({ _completeness, ...r }) => r)
}

const recipesDir = path.join(outDir, 'recipes')
const files = fs.readdirSync(recipesDir).filter((f) => f.endsWith('.json'))
console.log(`Found ${files.length} completed PDF(s) in ${recipesDir}`)

const allRecipes = []
for (const f of files) {
  const recipes = JSON.parse(fs.readFileSync(path.join(recipesDir, f), 'utf8'))
  allRecipes.push(...recipes.map(normalizeRecipe))
}

const deduped = dedupeAcrossFiles(allRecipes)

// A "recipe" with no real ingredients or steps isn't one — usually a false
// positive (a blog headline, a "make your own X" template blurb) rather
// than something with content that's just missing. Never invent filler to
// pass validation; instead keep these out of the import-ready file and
// list them separately so nothing silently disappears.
const complete = deduped.filter((r) => r.ingredients && String(r.ingredients).trim() && r.steps && String(r.steps).trim())
const incomplete = deduped.filter((r) => !(r.ingredients && String(r.ingredients).trim() && r.steps && String(r.steps).trim()))

const reviewPath = path.join(outDir, 'recipes-ready-for-review.json')
fs.writeFileSync(reviewPath, JSON.stringify(complete, null, 2))
const incompletePath = path.join(outDir, 'recipes-incomplete.json')
if (incomplete.length) fs.writeFileSync(incompletePath, JSON.stringify(incomplete, null, 2))

console.log(`  ${allRecipes.length} recipe(s) across ${files.length} file(s) processed so far`)
console.log(`  ${deduped.length} after deduplication`)
console.log(`  ${complete.length} complete (ingredients + steps present) -> ${reviewPath}`)
if (incomplete.length) {
  console.log(`  ${incomplete.length} excluded (missing ingredients or steps, likely not real recipes) -> ${incompletePath}`)
  incomplete.forEach((r) => console.log(`    - ${r.name} (${r._sourceFile})`))
}
