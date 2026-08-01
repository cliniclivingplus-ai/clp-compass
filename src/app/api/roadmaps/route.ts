import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get('session_id')
  const patientId = searchParams.get('patient_id')

  const base = () => supabaseAdmin.from('roadmaps').select('*').order('created_at', { ascending: false })

  if (sessionId) {
    // A session has at most one roadmap — the interpret page uses this to
    // check for (and resume editing) an already-generated one, and expects
    // a single object back, not an array.
    const { data, error } = await base().eq('session_id', sessionId).limit(1).single()
    if (error) return NextResponse.json(null, { status: 404 })
    return NextResponse.json(data)
  }

  if (patientId) {
    // A patient can accumulate a roadmap per session over time — the
    // Roadmaps tab lists all of them, so this must return the full array.
    // (Previously this also called .single(), which silently discarded
    // every real roadmap because the frontend's Array.isArray check failed
    // on the single object it got back — always rendering "No guides yet"
    // regardless of what was actually in the database.)
    const { data, error } = await base().eq('patient_id', patientId)
    if (error) return NextResponse.json([], { status: 500 })
    return NextResponse.json(data ?? [])
  }

  return NextResponse.json([], { status: 400 })
}
