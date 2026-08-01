import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { supabaseAdmin } from '@/lib/supabase'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error } = await supabaseAdmin.from('recipe_bank').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

const MEAL_TYPES = new Set(['breakfast', 'lunch', 'dinner', 'snack'])

// Lets a coach fix a recipe whose ingredients/steps came out garbled from a
// bulk PDF import (e.g. leftover page-footer text, or tips text that bled
// into the method) without deleting and re-adding it from scratch.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const update: Record<string, unknown> = {}
  if (typeof body.name === 'string' && body.name.trim()) update.name = body.name.trim()
  if (typeof body.meal_type === 'string') {
    if (!MEAL_TYPES.has(body.meal_type)) return NextResponse.json({ error: 'meal_type must be breakfast, lunch, dinner, or snack' }, { status: 400 })
    update.meal_type = body.meal_type
  }
  if (typeof body.protein_label === 'string') update.protein_label = body.protein_label.trim() || null
  if (typeof body.ingredients === 'string' && body.ingredients.trim()) update.ingredients = body.ingredients.trim()
  if (typeof body.steps === 'string' && body.steps.trim()) update.steps = body.steps.trim()
  if (Array.isArray(body.tags)) update.tags = body.tags.map((t: string) => String(t).trim().toLowerCase()).filter(Boolean)
  else if (typeof body.tags === 'string') update.tags = body.tags.split(',').map((t: string) => t.trim().toLowerCase()).filter(Boolean)

  const { data, error } = await supabaseAdmin.from('recipe_bank').update(update).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
