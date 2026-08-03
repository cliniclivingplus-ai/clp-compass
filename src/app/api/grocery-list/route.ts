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
// instead of the raw ingredient lines keeps the prompt small and reliable;
// this pass just catches what fixed rules can't (spelling variants, oddly
// worded near-duplicates, better categorization) — it reviews and merges,
// it doesn't re-extract from scratch, so it can't invent an item that
// wasn't already a candidate.
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
        content: `You are given a candidate grocery shopping list already extracted from a patient's recipes, one item per line as "name (category)". It has already had quantities/units/prep-instructions stripped, but may still contain: near-duplicates or synonyms of the same real ingredient worded differently ("garlic" and "garlic clove"), spelling variants ("chilli"/"chilly"), or an item filed under the wrong category.

You MUST include every distinct real ingredient from the input in your output — do not drop or skip any of them. Your only jobs are to:
1. Merge entries that are clearly the same real-world ingredient into one (keep the clearer/shorter name).
2. Fix a category if it's clearly wrong.
3. Drop an entry only if it is not a real food/ingredient at all (leftover junk text, not a legitimate but oddly-named ingredient).

Never invent an ingredient that isn't already in the input list. The output item count should be close to the input count (fewer only where you genuinely merged duplicates) — a much shorter output than input is a sign you dropped real items, which is not allowed.

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
