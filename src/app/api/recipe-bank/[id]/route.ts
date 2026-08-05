import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { supabaseAdmin } from '@/lib/supabase'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data: existing } = await supabaseAdmin.from('recipe_bank').select('image_storage_path').eq('id', id).single()
  if (existing?.image_storage_path) {
    await supabaseAdmin.storage.from('recipe-images').remove([existing.image_storage_path])
  }
  const { error } = await supabaseAdmin.from('recipe_bank').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

const MEAL_TYPES = new Set(['breakfast', 'lunch', 'dinner', 'snack', 'dessert'])

// Lets a coach fix a recipe whose ingredients/steps came out garbled from a
// bulk PDF import (e.g. leftover page-footer text, or tips text that bled
// into the method) without deleting and re-adding it from scratch.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const update: Record<string, unknown> = {}
  if (typeof body.name === 'string' && body.name.trim()) update.name = body.name.trim()
  if (typeof body.meal_type === 'string') {
    if (!MEAL_TYPES.has(body.meal_type)) return NextResponse.json({ error: 'meal_type must be breakfast, lunch, dinner, snack, or dessert' }, { status: 400 })
    update.meal_type = body.meal_type
  }
  if (typeof body.protein_label === 'string') update.protein_label = body.protein_label.trim() || null
  if (typeof body.ingredients === 'string' && body.ingredients.trim()) update.ingredients = body.ingredients.trim()
  if (typeof body.steps === 'string' && body.steps.trim()) update.steps = body.steps.trim()
  if (Array.isArray(body.tags)) update.tags = body.tags.map((t: string) => String(t).trim().toLowerCase()).filter(Boolean)
  else if (typeof body.tags === 'string') update.tags = body.tags.split(',').map((t: string) => t.trim().toLowerCase()).filter(Boolean)
  if (typeof body.eat_time === 'string') update.eat_time = body.eat_time.trim() || null
  if (typeof body.prep_time === 'string') update.prep_time = body.prep_time.trim() || null
  if (typeof body.cook_time === 'string') update.cook_time = body.cook_time.trim() || null
  if (typeof body.difficulty === 'string') update.difficulty = body.difficulty.trim() || null
  if (typeof body.health_score === 'string') update.health_score = body.health_score.trim() || null
  if (typeof body.servings === 'string') update.servings = body.servings.trim() || null
  if (Array.isArray(body.tools)) update.tools = body.tools.map((t: string) => String(t).trim()).filter(Boolean)
  else if (typeof body.tools === 'string') update.tools = body.tools.split('\n').map((t: string) => t.trim()).filter(Boolean)
  if (Array.isArray(body.notes)) update.notes = body.notes.map((t: string) => String(t).trim()).filter(Boolean)
  else if (typeof body.notes === 'string') update.notes = body.notes.split('\n').map((t: string) => t.trim()).filter(Boolean)
  if (Array.isArray(body.benefits)) update.benefits = body.benefits.map((t: string) => String(t).trim()).filter(Boolean)
  else if (typeof body.benefits === 'string') update.benefits = body.benefits.split('\n').map((t: string) => t.trim()).filter(Boolean)
  if (typeof body.image_url === 'string') {
    update.image_url = body.image_url.trim() || null
    update.image_storage_path = typeof body.image_storage_path === 'string' ? (body.image_storage_path.trim() || null) : null
    // Replacing or clearing a recipe's photo shouldn't leave the old file
    // orphaned in storage — same cleanup DELETE already does.
    const { data: existing } = await supabaseAdmin.from('recipe_bank').select('image_storage_path').eq('id', id).single()
    if (existing?.image_storage_path && existing.image_storage_path !== update.image_storage_path) {
      await supabaseAdmin.storage.from('recipe-images').remove([existing.image_storage_path])
    }
  }

  const { data, error } = await supabaseAdmin.from('recipe_bank').update(update).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
