import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await supabaseAdmin.from('nutritionists').select('*').order('full_name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  if (!body.full_name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  const { data, error } = await supabaseAdmin.from('nutritionists').insert({
    full_name: body.full_name.trim(),
    designation: body.designation ?? null,
    bio: body.bio ?? null,
    response_note: body.response_note ?? null,
    photo_url: body.photo_url ?? null,
    email: body.email ?? null,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
