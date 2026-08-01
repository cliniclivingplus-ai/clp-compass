import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { buildGuideData } from '@/lib/pdf/buildGuideData'
import DashboardClient from './DashboardClient'

export const revalidate = 0
export const dynamic = 'force-dynamic'

// Public, no-login page — same trust model as the PDF download link. A coach
// shares this URL directly with the patient (WhatsApp/email); the same link
// also works for the coach to review check-in history before a session.
export default async function PatientDashboardPage({ params }: { params: Promise<{ roadmapId: string }> }) {
  const { roadmapId } = await params

  const [{ data: roadmap, error }, { data: checkins }, { data: recipes }, { data: imageBank }] = await Promise.all([
    supabaseAdmin
      .from('roadmaps')
      .select('*, patients(full_name, gender, primary_concern, nutritionists(id, full_name, designation, bio, response_note, photo_url, email)), sessions(case_summary)')
      .eq('id', roadmapId)
      .single(),
    supabaseAdmin.from('roadmap_checkins').select('week_number, action_index, checkin_date').eq('roadmap_id', roadmapId),
    supabaseAdmin.from('recipe_bank').select('*'),
    supabaseAdmin.from('guide_images').select('id, label, tags, image_url'),
  ])

  if (error || !roadmap) notFound()

  const guideData = buildGuideData(roadmap, imageBank ?? [], recipes ?? [])

  return <DashboardClient roadmapId={roadmapId} data={guideData} initialCheckins={checkins ?? []} />
}
