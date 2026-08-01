import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { supabaseAdmin } from '@/lib/supabase'

const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

export async function GET() {
  const { data, error } = await supabaseAdmin.from('guide_images').select('*').order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const file = form.get('file')
  const label = String(form.get('label') || '').trim()
  const tagsRaw = String(form.get('tags') || '')
  const tags = [...new Set(tagsRaw.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))]

  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: 'Use a PNG, JPEG, or WebP image' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Image must be under 5MB' }, { status: 400 })
  if (!label) return NextResponse.json({ error: 'Give the image a short label' }, { status: 400 })
  if (!tags.length) return NextResponse.json({ error: 'Add at least one tag so it can be matched (e.g. "sleep", "breakfast")' }, { status: 400 })

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  const { error: uploadError } = await supabaseAdmin.storage
    .from('guide-images')
    .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: true })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: publicUrl } = supabaseAdmin.storage.from('guide-images').getPublicUrl(path)

  const { data, error } = await supabaseAdmin
    .from('guide_images')
    .insert({ label, tags, storage_path: path, image_url: publicUrl.publicUrl })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
