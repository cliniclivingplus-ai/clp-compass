import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { supabaseAdmin } from '@/lib/supabase'

const MEAL_TYPES = new Set(['breakfast', 'lunch', 'dinner', 'snack', 'dessert'])

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
  const eatTime = String(body.eat_time || '').trim()
  const prepTime = String(body.prep_time || '').trim()
  const cookTime = String(body.cook_time || '').trim()
  const difficulty = String(body.difficulty || '').trim()
  const healthScore = String(body.health_score || '').trim()
  const servings = String(body.servings || '').trim()
  const tools = Array.isArray(body.tools)
    ? body.tools.map((t: string) => String(t).trim()).filter(Boolean)
    : String(body.tools || '').split('\n').map((t: string) => t.trim()).filter(Boolean)
  const notes = Array.isArray(body.notes)
    ? body.notes.map((t: string) => String(t).trim()).filter(Boolean)
    : String(body.notes || '').split('\n').map((t: string) => t.trim()).filter(Boolean)
  const benefits = Array.isArray(body.benefits)
    ? body.benefits.map((t: string) => String(t).trim()).filter(Boolean)
    : String(body.benefits || '').split('\n').map((t: string) => t.trim()).filter(Boolean)
  const imageUrl = String(body.image_url || '').trim()
  const imageStoragePath = String(body.image_storage_path || '').trim()

  if (!name) return NextResponse.json({ error: 'Give the recipe a name' }, { status: 400 })
  if (!MEAL_TYPES.has(mealType)) return NextResponse.json({ error: 'meal_type must be breakfast, lunch, dinner, snack, or dessert' }, { status: 400 })
  if (!ingredients) return NextResponse.json({ error: 'Add the ingredients' }, { status: 400 })
  if (!steps) return NextResponse.json({ error: 'Add the steps' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('recipe_bank')
    .insert({
      name, meal_type: mealType, protein_label: proteinLabel || null, ingredients, steps, tags,
      eat_time: eatTime || null, prep_time: prepTime || null, cook_time: cookTime || null,
      difficulty: difficulty || null, health_score: healthScore || null, servings: servings || null,
      tools, notes, benefits,
      image_url: imageUrl || null, image_storage_path: imageStoragePath || null,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
