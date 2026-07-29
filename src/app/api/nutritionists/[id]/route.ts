import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { supabaseAdmin } from '@/lib/supabase'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const update: Record<string, unknown> = {}
  for (const key of ['full_name', 'designation', 'bio', 'response_note', 'photo_url', 'email'] as const) {
    if (key in body) update[key] = body[key]
  }
  const { data, error } = await supabaseAdmin.from('nutritionists').update(update).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // Unlink any patients pointing at this coach first — nutritionist_id has no
  // ON DELETE behavior set, so deleting a still-referenced coach would
  // otherwise fail the foreign key constraint.
  const { error: unlinkError } = await supabaseAdmin.from('patients').update({ nutritionist_id: null }).eq('nutritionist_id', id)
  if (unlinkError) return NextResponse.json({ error: unlinkError.message }, { status: 500 })

  const { error } = await supabaseAdmin.from('nutritionists').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
