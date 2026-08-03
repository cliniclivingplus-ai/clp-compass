import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

import { supabaseAdmin } from '@/lib/supabase'
import { extractReportText, ScannedPdfError } from '@/lib/reports/extractText'
import { summarizeReportForPatient } from '@/lib/reports/summarizeReport'
import { extractSupplementsFromReport } from '@/lib/reports/extractSupplements'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data, error } = await supabaseAdmin
    .from('patient_reports')
    .select('*')
    .eq('patient_id', id)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: patientId } = await params
  const form = await req.formData()
  const file = form.get('file')
  const reportType = form.get('report_type')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (typeof reportType !== 'string' || !reportType.trim()) return NextResponse.json({ error: 'Report type is required' }, { status: 400 })

  const { data: patient } = await supabaseAdmin.from('patients').select('full_name').eq('id', patientId).single()
  if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 })

  // Upload the original file first so it's preserved even if extraction fails.
  const ext = file.name.split('.').pop() || 'bin'
  const path = `${patientId}/${Date.now()}.${ext}`
  const buffer = await file.arrayBuffer()
  const { error: uploadError } = await supabaseAdmin.storage
    .from('patient-reports')
    .upload(path, buffer, { contentType: file.type, upsert: false })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: signedUrl } = await supabaseAdmin.storage.from('patient-reports').createSignedUrl(path, 60 * 60 * 24 * 365)

  const { data: report, error: insertError } = await supabaseAdmin
    .from('patient_reports')
    .insert({
      patient_id: patientId,
      report_type: reportType.trim(),
      file_name: file.name,
      file_url: signedUrl?.signedUrl ?? null,
      status: 'processing',
    })
    .select()
    .single()
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  try {
    const rawText = await extractReportText(buffer, file.type)
    const [summary, supplements] = await Promise.all([
      summarizeReportForPatient(reportType.trim(), patient.full_name, rawText),
      extractSupplementsFromReport(rawText),
    ])
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('patient_reports')
      // supplements is a draft only — supplements_confirmed stays false
      // (its default) until a coach reviews and confirms it.
      .update({ raw_text: rawText, patient_summary: summary, supplements, status: 'ready' })
      .eq('id', report.id)
      .select()
      .single()
    if (updateError) throw new Error(updateError.message)
    return NextResponse.json(updated)
  } catch (err) {
    const message = err instanceof ScannedPdfError ? err.message : err instanceof Error ? err.message : 'Extraction failed'
    await supabaseAdmin.from('patient_reports').update({ status: 'failed', error_message: message }).eq('id', report.id)
    return NextResponse.json({ error: message, report: { ...report, status: 'failed', error_message: message } }, { status: 422 })
  }
}
