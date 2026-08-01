import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { supabaseAdmin } from '@/lib/supabase'

const MEAL_TYPES = new Set(['breakfast', 'lunch', 'dinner', 'snack'])

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mealType = searchParams.get('meal_type')
  let query = supabaseAdmin.from('recipe_bank').select('*').order('created_at', { ascending: false })
  if (mealType) query = query.eq('meal_type', mealType)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const name = String(body.name || '').trim()
  const mealType = String(body.meal_type || '').trim()
  const proteinLabel = String(body.protein_label || '').trim()
  const ingredients = String(body.ingredients || '').trim()
  const steps = String(body.steps || '').trim()
  const tags = Array.isArray(body.tags)
    ? body.tags.map((t: string) => String(t).trim().toLowerCase()).filter(Boolean)
    : String(body.tags || '').split(',').map((t: string) => t.trim().toLowerCase()).filter(Boolean)

  if (!name) return NextResponse.json({ error: 'Give the recipe a name' }, { status: 400 })
  if (!MEAL_TYPES.has(mealType)) return NextResponse.json({ error: 'meal_type must be breakfast, lunch, dinner, or snack' }, { status: 400 })
  if (!ingredients) return NextResponse.json({ error: 'Add the ingredients' }, { status: 400 })
  if (!steps) return NextResponse.json({ error: 'Add the steps' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('recipe_bank')
    .insert({ name, meal_type: mealType, protein_label: proteinLabel || null, ingredients, steps, tags })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
