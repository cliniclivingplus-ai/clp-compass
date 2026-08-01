import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { supabaseAdmin } from '@/lib/supabase'

// Public — this is read/written from the shareable, no-login patient
// dashboard, same trust model as the PDF download link.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ roadmapId: string }> }) {
  const { roadmapId } = await params
  const { data, error } = await supabaseAdmin
    .from('roadmap_checkins')
    .select('week_number, action_index, checkin_date')
    .eq('roadmap_id', roadmapId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// Toggles a single (week, action, date) check-in — inserts it if missing,
// deletes it if already checked. Returns the new checked state so the client
// can reconcile if two taps race.
export async function POST(req: NextRequest, { params }: { params: Promise<{ roadmapId: string }> }) {
  const { roadmapId } = await params
  const body = await req.json()
  const weekNumber = Number(body.week_number)
  const actionIndex = Number(body.action_index)
  const checkinDate = String(body.date || '')
  if (!Number.isFinite(weekNumber) || !Number.isFinite(actionIndex) || !/^\d{4}-\d{2}-\d{2}$/.test(checkinDate)) {
    return NextResponse.json({ error: 'Missing or invalid week_number, action_index, or date' }, { status: 400 })
  }

  const { data: existing } = await supabaseAdmin
    .from('roadmap_checkins')
    .select('id')
    .eq('roadmap_id', roadmapId)
    .eq('week_number', weekNumber)
    .eq('action_index', actionIndex)
    .eq('checkin_date', checkinDate)
    .maybeSingle()

  if (existing) {
    const { error } = await supabaseAdmin.from('roadmap_checkins').delete().eq('id', existing.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ checked: false })
  }

  const { error } = await supabaseAdmin.from('roadmap_checkins').insert({
    roadmap_id: roadmapId, week_number: weekNumber, action_index: actionIndex, checkin_date: checkinDate,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ checked: true })
}
