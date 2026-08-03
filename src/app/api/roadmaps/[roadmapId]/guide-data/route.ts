import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { buildGuideData } from '@/lib/pdf/buildGuideData'

// Feeds the coach-facing editable dashboard preview (interpret page) the
// exact same GuideData shape the read-only patient dashboard and the PDF
// use — so what the coach edits is what the patient actually sees, with no
// separate "preview" data model to drift out of sync.
export async function GET(req: NextRequest, { params }: { params: Promise<{ roadmapId: string }> }) {
  const { roadmapId } = await params

  const [{ data: roadmap, error }, { data: imageBank }, { data: recipeBank }] = await Promise.all([
    supabaseAdmin
      .from('roadmaps')
      .select('*, patients(full_name, gender, primary_concern, nutritionists(id, full_name, designation, bio, response_note, photo_url, email)), sessions(case_summary)')
      .eq('id', roadmapId)
      .single(),
    supabaseAdmin.from('guide_images').select('id, label, tags, image_url'),
    supabaseAdmin.from('recipe_bank').select('*'),
  ])

  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!roadmap) return Response.json({ error: 'Not found' }, { status: 404 })

  const { data: supplementReport } = await supabaseAdmin
    .from('patient_reports')
    .select('supplements')
    .eq('patient_id', roadmap.patient_id)
    .eq('supplements_confirmed', true)
    .not('supplements', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const data = buildGuideData(roadmap, imageBank ?? [], recipeBank ?? [], supplementReport?.supplements ?? [])
  return Response.json({ data })
}
