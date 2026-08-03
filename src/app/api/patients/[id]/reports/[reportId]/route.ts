import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { supabaseAdmin } from '@/lib/supabase'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; reportId: string }> }) {
  const { reportId } = await params
  const { error } = await supabaseAdmin.from('patient_reports').delete().eq('id', reportId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// Lets a coach fix the AI-extracted supplement list (wrong dose/timing read
// off the PDF, a row that shouldn't be there, one that's missing) and
// explicitly confirm it — this is the only way supplements ever reach the
// patient dashboard, never automatically on upload.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; reportId: string }> }) {
  const { reportId } = await params
  const body = await req.json()
  const update: Record<string, unknown> = {}
  if (Array.isArray(body.supplements)) {
    update.supplements = (body.supplements as Record<string, unknown>[])
      .filter((s) => !!s && typeof s === 'object' && typeof s.name === 'string' && !!(s.name as string).trim())
      .map((s) => ({
        name: String(s.name).trim(),
        dose: typeof s.dose === 'string' ? s.dose.trim() : '',
        timing: typeof s.timing === 'string' ? s.timing.trim() : '',
        notes: typeof s.notes === 'string' ? s.notes.trim() : '',
        duration: typeof s.duration === 'string' ? s.duration.trim() : '',
      }))
  }
  if (typeof body.supplements_confirmed === 'boolean') update.supplements_confirmed = body.supplements_confirmed

  const { data, error } = await supabaseAdmin.from('patient_reports').update(update).eq('id', reportId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
