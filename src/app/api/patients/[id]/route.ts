import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data, error } = await supabaseAdmin.from('patients').select('*').eq('id', id).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const { data, error } = await supabaseAdmin.from('patients').update(body).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// Permanent — sessions, roadmaps, roadmap_checkins, and patient_reports all
// cascade-delete via their own patients_id/roadmap_id foreign keys (see
// supabase/schema.sql + migration_v13/v15), so this one delete is enough to
// clean up everything for this patient, nothing orphaned left behind.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error } = await supabaseAdmin.from('patients').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: true })
}
