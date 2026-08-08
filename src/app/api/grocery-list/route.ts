import { NextRequest, NextResponse } from 'next/server'
import Groq from 'groq-sdk'
import { GROCERY_CATEGORY_ORDER, type GroceryCategory } from '@/lib/groceryList'

export const dynamic = 'force-dynamic'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
const MAX_ITEMS = 200

// The regex-based buildGroceryList() in src/lib/groceryList.ts already turns
// raw recipe ingredient lines into a candidate {name, category} list — fast,
// deterministic, and the instant fallback shown while this call is in
// flight. Sending its (already deduplicated, already shortened) output here
// instead of the raw ingredient lines keeps the prompt small and reliable.
// Some source PDFs had a two-column layout (ingredients beside directions)
// that the extractor read row-by-row, so a handful of candidates are really
// a whole instruction sentence with a real ingredient buried inside it
// (e.g. "Add cashew nuts and peanuts", "Pressure cook soaked chole until
// soft") rather than a clean ingredient name — this pass is also the one
// place that untangles those, pulling out just the real food name.
export async function POST(req: NextRequest) {
  const body = await req.json()
  const candidates: { name: string; category: string }[] = Array.isArray(body.items)
    ? body.items.filter((it: unknown): it is { name: string; category: string } =>
        !!it && typeof it === 'object' && typeof (it as Record<string, unknown>).name === 'string' && !!(it as Record<string, unknown>).name)
    : []
  if (candidates.length === 0) return NextResponse.json({ categories: [] })

  const trimmed = candidates.slice(0, MAX_ITEMS)
  const inputText = trimmed.map((c) => `${c.name} (${c.category})`).join('\n')

  const completion = await groq.chat.completions.create({
    model: 'openai/gpt-oss-20b',
    temperature: 0.1,
    max_tokens: 4000,
    reasoning_effort: 'low',
    response_format: { type: 'json_object' as const },
    messages: [
      {
        role: 'system',
        content: `You are given a candidate grocery shopping list already extracted from a patient's recipes, one item per line as "name (category)". It has already had quantities/units/prep-instructions stripped, but may still contain: near-duplicates or synonyms of the same real ingredient worded differently ("garlic" and "garlic clove"), spelling variants ("chilli"/"chilly"), an item filed under the wrong category, or — because some source PDFs had ingredients and cooking directions in side-by-side columns that got merged during extraction — a whole instruction sentence with a real ingredient buried inside it (e.g. "Add cashew nuts and peanuts", "Pressure cook soaked chole until soft", "Cover the lid and simmer for 10 minutes").

Your jobs are to:
1. Merge entries that are clearly the same real-world ingredient into one (keep the clearer/shorter name).
2. Fix a category if it's clearly wrong.
3. If an entry reads like a cooking instruction (contains an imperative verb like add/cook/heat/simmer/mix/stir/garnish/pressure cook, or a time/quantity like "10 minutes", "3 whistles") rather than a plain ingredient name, pull out just the real food name(s) it mentions and output those instead (e.g. "Add cashew nuts and peanuts" → "Cashew nuts" and "Peanuts"). If it names no real food at all, drop it.
4. Drop an entry that is a vague back-reference rather than a specific food ("remaining vegetables", "the rest of the spices") — nothing to actually shop for.
5. Drop an entry that's a bare unit or nutrition-label word with no food attached — "water" (everyone has it, never a real shopping item), "powder" or "extract" alone (only a real product when paired with what it's made of, e.g. "protein powder" or "vanilla extract" — those stay), "kcal", "calories", "nutrition information".
6. Drop an entry only if it names no real food/ingredient at all — never drop a real ingredient just because it was phrased oddly or wrapped in instruction text.

Never invent an ingredient that isn't named somewhere in the input list — you may split one messy entry into the separate real ingredients it names, but you may not add anything not already present.

Valid categories: ${GROCERY_CATEGORY_ORDER.join(', ')}.

Respond with strict JSON only: {"items": [{"name": "...", "category": "..."}]}`,
      },
      { role: 'user', content: inputText },
    ],
  })

  const raw = completion.choices[0]?.message?.content?.trim()
  if (!raw) return NextResponse.json({ categories: [] })

  try {
    const parsed = JSON.parse(raw)
    const items: { name: string; category: string }[] = Array.isArray(parsed.items)
      ? parsed.items
          .filter((it: unknown): it is Record<string, unknown> => !!it && typeof it === 'object' && typeof (it as Record<string, unknown>).name === 'string' && !!(it as Record<string, unknown>).name)
          .map((it: Record<string, unknown>) => ({
            name: String(it.name).trim(),
            category: typeof it.category === 'string' && GROCERY_CATEGORY_ORDER.includes(it.category) ? it.category : 'Other',
          }))
      : []

    // A response that dropped most of the input is worse than the
    // heuristic fallback it would replace — better to keep showing the
    // fallback than to silently lose real items the patient needs to buy.
    if (items.length < trimmed.length * 0.6) return NextResponse.json({ categories: [] })

    const buckets = new Map<string, Map<string, string>>()
    for (const it of items) {
      if (!it.name) continue
      const key = it.name.toLowerCase()
      if (!buckets.has(it.category)) buckets.set(it.category, new Map())
      buckets.get(it.category)!.set(key, it.name)
    }
    const categories: GroceryCategory[] = GROCERY_CATEGORY_ORDER
      .filter((head) => buckets.has(head))
      .map((head) => ({ head, items: [...buckets.get(head)!.values()].sort((a, b) => a.localeCompare(b)) }))

    return NextResponse.json({ categories })
  } catch {
    return NextResponse.json({ categories: [] })
  }
}
