import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// A 100+ recipe .docx/.txt upload plus a bulk insert can run past the default
// serverless timeout on a cold start.
export const maxDuration = 60

import { supabaseAdmin } from '@/lib/supabase'
import { parseRecipeBankText } from '@/lib/parseRecipeBank'

const MAX_BYTES = 5 * 1024 * 1024

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File must be under 5MB' }, { status: 400 })

  let text = ''
  try {
    if (file.name.toLowerCase().endsWith('.docx') || file.type.includes('officedocument.wordprocessingml')) {
      const buffer = Buffer.from(await file.arrayBuffer())
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ buffer })
      text = result.value
    } else {
      text = await file.text()
    }
  } catch (err) {
    return NextResponse.json({ error: `Could not read the file: ${err instanceof Error ? err.message : 'unknown error'}` }, { status: 400 })
  }

  const { recipes, errors } = parseRecipeBankText(text)
  if (!recipes.length) {
    return NextResponse.json({ error: 'No valid recipes found — check the file matches the format.', parseErrors: errors }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('recipe_bank')
    .insert(recipes.map((r) => ({
      name: r.name, meal_type: r.meal_type, protein_label: r.protein_label || null,
      ingredients: r.ingredients, steps: r.steps, tags: r.tags,
      eat_time: r.eat_time || null, prep_time: r.prep_time || null, cook_time: r.cook_time || null,
      difficulty: r.difficulty || null, health_score: r.health_score || null, servings: r.servings || null,
      tools: r.tools, notes: r.notes, benefits: r.benefits,
      image_url: r.image_url || null,
    })))
    .select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ inserted: data ?? [], parseErrors: errors })
}
