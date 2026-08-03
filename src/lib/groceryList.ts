// Builds a shopping list from the actual ingredient lines of the recipes
// shown to a specific patient (their "Your power plates" + weekly recipe
// picks), instead of the generic reference list in foodPlates.ts. Each raw
// ingredient line (e.g. "1/2 cup finely chopped red bell pepper") is
// stripped down to just the food item — quantities, units, and prep/
// packaging instructions (chopped, drained, thumb-sized, 1 tbsp, 15oz can…)
// don't change what to buy, so they're stripped rather than shown verbatim —
// then bucketed into a category by keyword match. An unmatched item still
// shows up, just under "Other", never dropped.
import { splitRecipeLines } from './recipeText'

export type GroceryCategory = { head: string; items: string[] }

// Single source of truth for the fixed category set, shared with the AI
// categorization route (src/app/api/grocery-list/route.ts) so both the
// regex-based fallback and the AI pass always bucket into the same names.
export const GROCERY_CATEGORY_ORDER = ['Fruit', 'Vegetables', 'Grains & millets', 'Lentils & protein', 'Nuts & seeds', 'Herbs, spices & pantry', 'Other']

const CATEGORY_KEYWORDS: { head: string; keywords: string[] }[] = [
  { head: 'Fruit', keywords: ['apple', 'banana', 'papaya', 'pear', 'orange', 'berry', 'berries', 'pomegranate', 'kiwi', 'mango', 'grape', 'lemon', 'lime', 'avocado', 'date', 'fig', 'melon', 'watermelon', 'strawberr', 'blueberr', 'raspberr', 'passionfruit', 'peach'] },
  { head: 'Vegetables', keywords: ['broccoli', 'cauliflower', 'kale', 'cabbage', 'spinach', 'bell pepper', 'capsicum', 'pumpkin', 'zucchini', 'mushroom', 'gourd', 'asparagus', 'carrot', 'beet', 'cucumber', 'tomato', 'onion', 'garlic', 'ginger', 'celery', 'lettuce', 'greens', 'pea', 'corn', 'sweet potato', 'potato', 'radish', 'okra', 'eggplant', 'brinjal', 'scallion', 'watercress'] },
  { head: 'Grains & millets', keywords: ['oat', 'rice', 'ragi', 'jowar', 'bajra', 'quinoa', 'buckwheat', 'amaranth', 'millet', 'barley', 'wheat', 'flour', 'bread', 'pasta', 'noodle', 'spaghetti', 'tortilla', 'breadcrumb'] },
  { head: 'Lentils & protein', keywords: ['moong', 'masoor', 'chana', 'toor dal', 'dal', 'rajma', 'tofu', 'tempeh', 'edamame', 'sprout', 'hummus', 'lentil', 'chickpea', 'bean', 'egg', 'chicken', 'fish', 'salmon', 'prawn', 'steak', 'bacon', 'paneer', 'yogurt', 'yoghurt', 'curd', 'milk', 'cheese'] },
  { head: 'Nuts & seeds', keywords: ['almond', 'walnut', 'brazil nut', 'chia', 'flaxseed', 'flax seed', 'pumpkin seed', 'sesame', 'sunflower seed', 'cashew', 'pistachio', 'tahini'] },
  { head: 'Herbs, spices & pantry', keywords: ['cinnamon', 'turmeric', 'cumin', 'coriander', 'mint', 'basil', 'pepper', 'salt', 'honey', 'vinegar', 'oil', 'coconut', 'vanilla', 'cardamom', 'clove', 'bay leaf', 'mustard seed', 'curry leaf', 'chili', 'chilli', 'paprika', 'oregano', 'stock', 'sweetener', 'sauce', 'pesto', 'sugar', 'baking powder', 'cocoa'] },
]

// Words describing how to prep or package an ingredient, not what it is —
// they don't change what a patient needs to buy, so they're stripped rather
// than left in as clutter (e.g. "thinly sliced garlic clove" and "garlic
// cloves" should both just read "Garlic"). Deliberately excludes words that
// describe a genuinely different product (frozen, dried, unsweetened,
// low-salt) since those do affect what's picked off the shelf.
const NOISE_WORDS = /\b(fresh|finely|coarsely|roughly|thinly|thickly|small|medium|large|extra|ripe|boneless|skinless|deveined|peeled|grated|chopped|sliced|diced|minced|crushed|crumbled|drained|rinsed|cooked|raw|packet|packets|bag|bags|box|boxes|tin|tins|jar|jars|can|cans|lean|rasher|rashers|thumb|sized|piece|pieces|clove|cloves)\b/gi

// Alternate spellings of the same ingredient (chilli/chilly, etc.) that
// would otherwise show up as two separate lines — normalized to one
// canonical spelling after all other cleanup, so a plural mangled by the
// singularizer above ("chillies" -> "chilly") also gets corrected here.
const SPELLING_VARIANTS: Record<string, string> = { chilly: 'chilli', chili: 'chilli' }

const UNIT_ALT = 'cups?|tbsps?|tbsp\\.?|tablespoons?|tsps?|tsp\\.?|teaspoons?|grams?|g|kg|mg|ml|milliliters?|l|liters?|oz\\.?|ounces?|lbs?|lb\\.?|pounds?|cloves?|inch(?:es)?|pinch(?:es)?|handfuls?|slices?|pieces?|bunch(?:es)?|stalks?|sprigs?|cans?|packets?|jars?|tins?|boxes?|each|drizzles?|splash(?:es)?|dash(?:es)?'
const LEADING_QTY = /^[\d½¼¾⅓⅔]+(\s*[\-\/.]\s*[\d½¼¾⅓⅔]+)*\s*/
const LEADING_MULT = /^[x×]\s*/i
const LEADING_UNIT = new RegExp(`^(?:${UNIT_ALT})\\.?\\s+`, 'i')
const LEADING_OF = /^of\s+/i
const TRAILING_QTY_UNIT = new RegExp(`\\s+[\\d½¼¾⅓⅔]+(\\s*[\\-/.]\\s*[\\d½¼¾⅓⅔]+)*(?:\\s+(?:${UNIT_ALT})\\.?)*\\s*$`, 'i')
// A raw line that's just an ALL-CAPS label ("STIR-FRY VEGETABLES", "FALL") is
// a recipe sub-heading baked into the ingredient text, not an ingredient —
// skip it entirely rather than listing it as something to shop for.
const ALL_CAPS_HEADER = /^[A-Z][A-Z\s\-]+$/
// Food words that are naturally shopped for/referred to in plural — don't
// singularize these even though they end in "s".
const KEEP_PLURAL = new Set(['oats', 'peas', 'greens', 'sprouts', 'seeds', 'nuts', 'beans', 'lentils', 'noodles', 'tortillas', 'chickpeas', 'breadcrumbs', 'walnuts', 'almonds', 'grapes', 'oats'])

function singularizeWord(word: string): string {
  const lower = word.toLowerCase()
  if (KEEP_PLURAL.has(lower)) return word
  if (lower.length > 4 && lower.endsWith('ies')) return word.slice(0, -3) + 'y'
  if (lower.length > 4 && lower.endsWith('oes')) return word.slice(0, -2)
  if (lower.length > 4 && /(?:ch|sh|x|z)es$/.test(lower)) return word.slice(0, -2)
  if (lower.length > 3 && lower.endsWith('s') && !/(?:us|ss|is)$/.test(lower)) return word.slice(0, -1)
  return word
}

function extractItemName(line: string): string {
  let s = line.trim()
  if (ALL_CAPS_HEADER.test(s) && s.length >= 3) return ''
  // "STIR-FRY VEGETABLES: 1 large carrot" / "Optional Toppings: Banana" —
  // the label before the colon is a heading, the real ingredient follows it.
  if (s.includes(':')) s = s.slice(s.lastIndexOf(':') + 1).trim()
  s = s.replace(/\([^)]*\)/g, '')
  s = s.split(',')[0]
  s = s.replace(/\bto taste\b/gi, '')

  // Quantities/units can stack ("1 x 15.5oz can") — strip leading ones in a
  // loop until nothing more matches, rather than assuming just one.
  let prev = ''
  while (prev !== s) {
    prev = s
    s = s.replace(LEADING_QTY, '').replace(LEADING_MULT, '').replace(LEADING_UNIT, '').replace(LEADING_OF, '').trim()
  }
  s = s.replace(TRAILING_QTY_UNIT, '')

  s = s.replace(/-/g, ' ')
  s = s.replace(NOISE_WORDS, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  s = s.replace(/^(a|an|the|of)\s+/i, '').replace(/\s+(of|and|or|with|in)$/i, '').trim()
  s = s.replace(/^[.,;:\-\s]+/, '').replace(/[.,;:\-\s]+$/, '').trim()
  if (/^(and|or|a|an|the|of|with|in)$/i.test(s)) return ''

  s = s.toLowerCase()
  // A line naming multiple alternative items ("blueberries or strawberries")
  // shouldn't have only its last word singularized — leave those as-is.
  if (!/\b(and|or)\b/.test(s)) {
    const words = s.split(' ')
    words[words.length - 1] = singularizeWord(words[words.length - 1])
    s = words.join(' ')
  }
  s = s.split(' ').map((w) => SPELLING_VARIANTS[w] || w).join(' ')
  return s
}

function titleCase(s: string): string {
  if (!s) return s
  return s[0].toUpperCase() + s.slice(1)
}

function categorize(name: string): string {
  const lower = name.toLowerCase()
  for (const cat of CATEGORY_KEYWORDS) {
    if (cat.keywords.some((kw) => lower.includes(kw))) return cat.head
  }
  return 'Other'
}

export function buildGroceryList(recipes: { ingredients: string }[]): GroceryCategory[] {
  const buckets = new Map<string, Map<string, string>>()
  for (const recipe of recipes) {
    for (const line of splitRecipeLines(recipe.ingredients || '')) {
      const name = extractItemName(line)
      if (!name || name.length < 2) continue
      const display = titleCase(name)
      const key = name
      const head = categorize(name)
      if (!buckets.has(head)) buckets.set(head, new Map())
      buckets.get(head)!.set(key, display)
    }
  }
  return GROCERY_CATEGORY_ORDER
    .filter((head) => buckets.has(head))
    .map((head) => ({ head, items: [...buckets.get(head)!.values()].sort((a, b) => a.localeCompare(b)) }))
}
