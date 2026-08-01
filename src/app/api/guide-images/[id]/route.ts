import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { supabaseAdmin } from '@/lib/supabase'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data: existing } = await supabaseAdmin.from('guide_images').select('storage_path').eq('id', id).single()
  if (existing?.storage_path) {
    await supabaseAdmin.storage.from('guide-images').remove([existing.storage_path])
  }
  const { error } = await supabaseAdmin.from('guide_images').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
