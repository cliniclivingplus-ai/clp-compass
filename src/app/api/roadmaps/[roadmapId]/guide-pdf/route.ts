import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { buildGuideData } from '@/lib/pdf/buildGuideData'
import { renderGuidePdf } from '@/lib/pdf/renderGuideDocument'

export const runtime = 'nodejs'

export async function GET(req: NextRequest, { params }: { params: Promise<{ roadmapId: string }> }) {
  const { roadmapId } = await params

  const { data: roadmap, error } = await supabaseAdmin
    .from('roadmaps')
    .select('*, patients(full_name, gender, primary_concern, nutritionists(full_name, designation, bio, response_note, photo_url, email)), sessions(case_summary)')
    .eq('id', roadmapId)
    .single()

  if (error) return new Response(error.message, { status: 500 })
  if (!roadmap) return new Response('Not found', { status: 404 })

  const guideData = buildGuideData(roadmap)
  const pdfBuffer = await renderGuidePdf(guideData)

  const fileName = `${roadmap.patients?.full_name?.replace(/\s+/g, '-') ?? 'client'}-wellness-guide.pdf`

  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
}
