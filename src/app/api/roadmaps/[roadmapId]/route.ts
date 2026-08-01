import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ roadmapId: string }> }) {
  const { roadmapId } = await params
  const { data, error } = await supabaseAdmin
    .from('roadmaps')
    .select('*, patients(full_name, gender, primary_concern, nutritionist_id, nutritionists(id, full_name, designation, bio, response_note, photo_url, email)), sessions(case_summary)')
    .eq('id', roadmapId)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

// Coach edits from the guide preview page — overview/lifestyle_guidelines are
// real columns already used by the PDF; guide_overrides holds fields that
// don't have a natural column (goal_label, why_reflection).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ roadmapId: string }> }) {
  const { roadmapId } = await params
  const body = await req.json()
  const update: Record<string, unknown> = {}
  if (typeof body.overview === 'string') update.overview = body.overview
  if (typeof body.lifestyle_guidelines === 'string') update.lifestyle_guidelines = body.lifestyle_guidelines
  // Coach edits to per-week goals/food menu from the wellness-guide preview —
  // the whole array is replaced, mirroring how the AI generator writes it.
  if (Array.isArray(body.weekly_schedule)) update.weekly_schedule = body.weekly_schedule
  if (body.guide_overrides && typeof body.guide_overrides === 'object') {
    const { data: existing } = await supabaseAdmin.from('roadmaps').select('guide_overrides').eq('id', roadmapId).single()
    update.guide_overrides = { ...(existing?.guide_overrides ?? {}), ...body.guide_overrides }
  }

  const { data, error } = await supabaseAdmin.from('roadmaps').update(update).eq('id', roadmapId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
