import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { supabaseAdmin } from '@/lib/supabase'

const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

// Upload-only — returns a URL the coach's recipe form then saves onto the
// recipe row itself (via POST/PATCH /api/recipe-bank), same two-step pattern
// as the picture bank. Kept separate from the recipe JSON body so the main
// recipe endpoints don't need to become multipart/form-data.
export async function POST(req: NextRequest) {
  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: 'Use a PNG, JPEG, or WebP image' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Image must be under 5MB' }, { status: 400 })

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  const { error: uploadError } = await supabaseAdmin.storage
    .from('recipe-images')
    .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: true })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: publicUrl } = supabaseAdmin.storage.from('recipe-images').getPublicUrl(path)
  return NextResponse.json({ image_url: publicUrl.publicUrl, image_storage_path: path })
}
