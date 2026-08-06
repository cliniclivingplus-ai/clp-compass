import Groq from 'groq-sdk'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
const MAX_REPORT_CHARS = 8000

export async function summarizeReportForPatient(reportType: string, patientName: string, rawText: string): Promise<string> {
  const completion = await groq.chat.completions.create({
    model: 'openai/gpt-oss-120b',
    temperature: 0.3,
    max_tokens: 700,
    messages: [
      {
        role: 'system',
        content: `You explain lab/diagnostic reports to patients in plain language. No unexplained jargon, if you use a clinical term, immediately say what it means in everyday words. Never diagnose or prescribe; describe what the report shows and flag anything notably outside a normal range, factually and calmly, without alarming language. 4-6 short paragraphs or bullet points, written directly to the patient using "you". Never use an em dash (—) anywhere; use a comma, period, or "and" instead.`,
      },
      {
        role: 'user',
        content: `Patient: ${patientName}\nReport type: ${reportType}\n\nReport text:\n${rawText.slice(0, MAX_REPORT_CHARS)}\n\nExplain this report to ${patientName} in plain language.`,
      },
    ],
  })
  return completion.choices[0]?.message?.content?.trim() ?? ''
}
