// src/app/api/qa-chat/route.ts
//
// Single clinical-discussion endpoint (coach-to-coach, never patient-facing).
// Modes: summary | chat | draft.
//
// FREE-TIER SAFE: Groq's free tier caps at 8,000 tokens/minute. Long consultation
// transcripts (10k+ tokens) blow past that, so we (a) trim the transcript to a
// safe budget before sending, and (b) return a clear message if we still hit 413.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Without this, Vercel defaults to a 10s function timeout — fine for a single
// Groq call, but chat mode now also does an HF embedding call + Supabase
// lookups before that, which can tip past 10s and get killed mid-request.
export const maxDuration = 60;

import Groq from 'groq-sdk';
import { supabaseAdmin } from '@/lib/supabase';
import { embedText } from '@/lib/embeddings';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const STOP_WORDS = new Set(['the', 'patient', 'is', 'are', 'was', 'with', 'and', 'has', 'have', 'been', 'their', 'they', 'this', 'that', 'from', 'for', 'not', 'but', 'can', 'also', 'more', 'very', 'some', 'into', 'over', 'after', 'what', 'when', 'how', 'why', 'about', 'should', 'would', 'could']);

type KbSource = { title: string; source_type: string };

// Grounds each chat turn in the clinical knowledge base (kb_documents/kb_chunks).
// Vector search first (needs HUGGINGFACE_API_KEY for embeddings), falls back to
// Postgres full-text search on keywords so retrieval still works without it.
// Returns both the context to feed the model AND the sources to show the coach —
// that second part is what lets the UI prove an answer was actually RAG-grounded.
async function retrieveKbContext(queryText: string): Promise<{ kbContext: string; sources: KbSource[] }> {
  const empty = { kbContext: '', sources: [] as KbSource[] };
  if (!queryText.trim()) return empty;

  const t0 = Date.now();
  try {
    let chunks: { content: string; document_id: string }[] = [];

    const embedding = await embedText(queryText.slice(0, 512));
    console.log(`[KB timing] embedText: ${Date.now() - t0}ms`);
    if (embedding && embedding.length === 384) {
      const tRpc = Date.now();
      const { data } = await supabaseAdmin.rpc('match_kb_chunks', {
        query_embedding: embedding,
        match_threshold: 0.3,
        match_count: 10, // was 6 — bumped now that real vector search works and
        // the KB is 11K+ docs; kept as an explicit cap (not unlimited) since
        // Groq's free tier shares one 8,000 TPM / 200,000 TPD budget across
        // every call, and an uncapped KB context injected into one message
        // could exhaust it by itself (already happened once this session).
      });
      console.log(`[KB timing] match_kb_chunks rpc: ${Date.now() - tRpc}ms`);
      if (data?.length) chunks = data;
    }

    if (!chunks.length) {
      // Without embeddings this is a blunt instrument, so favor precision over
      // recall: AND together the 2 most specific (longest) keywords rather than
      // OR-ing everything — an OR of generic words like "mechanism"/"therapy"
      // pulls in unrelated books (e.g. a habits book) as false "grounding".
      // (Was AND-of-3, but requiring 3 specific words to co-occur in one ~350-char
      // chunk missed too many real matches once queries combined more context.)
      const keywords = [...new Set(
        queryText.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
          .filter((w) => w.length > 4 && !STOP_WORDS.has(w))
      )]
        .sort((a, b) => b.length - a.length)
        .slice(0, 2);

      if (keywords.length >= 2) {
        const tKw = Date.now();
        const { data, error } = await supabaseAdmin
          .from('kb_chunks').select('content, document_id')
          .textSearch('content', keywords.join(' '), { type: 'plain', config: 'english' })
          .limit(10); // matches the vector-search cap above, now that real search works
        console.log(`[KB timing] keyword textSearch: ${Date.now() - tKw}ms`);
        if (error) console.error('KB keyword search error:', error.message);
        if (data?.length) chunks = data;
      }
    }

    if (!chunks.length) { console.log(`[KB timing] total (no chunks): ${Date.now() - t0}ms`); return empty; }

    const tDocs = Date.now();
    const docIds = [...new Set(chunks.map((c) => c.document_id))];
    const { data: docs } = await supabaseAdmin.from('kb_documents').select('id, title, source_type').in('id', docIds);
    console.log(`[KB timing] kb_documents lookup: ${Date.now() - tDocs}ms`);
    const docMap = Object.fromEntries((docs ?? []).map((d: { id: string; title: string; source_type: string }) => [d.id, d]));

    const kbContext = chunks.map((c, i) => `[KB ${i + 1}]: ${c.content.slice(0, 350)}`).join('\n\n');
    const sources: KbSource[] = docIds.map((id) => ({
      title: docMap[id]?.title ?? 'Unknown source',
      source_type: docMap[id]?.source_type ?? 'unknown',
    }));

    console.log(`[KB timing] total: ${Date.now() - t0}ms`);
    return { kbContext, sources };
  } catch (err) {
    console.error('KB retrieval error:', err instanceof Error ? err.message : err, `(after ${Date.now() - t0}ms)`);
    return empty; // retrieval is a bonus, never block the chat reply on it
  }
}

// Two models so we stay under the per-minute token limit:
const MODEL_FAST = 'openai/gpt-oss-20b';    // summaries / drafting — lighter load
const MODEL_CHAT = 'openai/gpt-oss-20b';    // discussion — keep on 20b for free-tier headroom

// Groq's free tier occasionally throws a transient error (brief 5xx/overload)
// that clears up moments later — this was showing up as "could not respond",
// with the coach having to manually resend the exact same message to get a
// reply. Retry once with a short backoff before giving up.
//
// IMPORTANT: never retry on 429/413 (rate limit). Retrying a rate-limited call
// doesn't help — it just burns more of an already-exhausted budget and adds
// latency, which can compound into a 60s function timeout when combined with
// the empty-content retry loop that also wraps this. Fail fast instead so
// friendlyError can respond immediately with the correct message.
async function withRetry<T>(fn: () => Promise<T>, retries = 1, delayMs = 800): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const status = err?.status;
      if (attempt >= retries || status === 429 || status === 413) throw err;
      console.error(`Groq call failed (attempt ${attempt + 1}/${retries + 1}), retrying:`, err instanceof Error ? err.message : err);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

// Rough token budget for the transcript we send. ~1 token ≈ 4 chars.
// Keep well under the 8k TPM limit once the prompt + reply are added.
// Groq reserves the FULL max_tokens upfront as "requested" tokens against the
// TPM budget, whether or not the model uses it all — a real production 429
// showed a single summary call requesting ~6,800 of the account's 8,000/min
// limit (16000-char transcript + 6000-char gemini summary + max_tokens 2048),
// leaving no headroom for anything else that minute. Was 16000/6000 chars;
// cut roughly in half so one call can't consume the whole budget by itself.
const MAX_TRANSCRIPT_CHARS = 8000; // ~2,000 tokens
// Gemini's own meeting-summary doc is a secondary reference, not the ground
// truth — give it a smaller budget so it can't crowd out the real transcript.
const MAX_GEMINI_SUMMARY_CHARS = 3000; // ~750 tokens

// Trim text to a safe size. Keeps the start (where concerns/history are
// stated) and the end (where plan/next-steps usually land), dropping the middle.
function trimToBudget(t: string, maxChars: number): string {
  if (!t) return '';
  if (t.length <= maxChars) return t;
  const head = t.slice(0, Math.floor(maxChars * 0.7));
  const tail = t.slice(-Math.floor(maxChars * 0.3));
  return `${head}\n\n…[middle trimmed to fit free-tier limit]…\n\n${tail}`;
}

function baseIdentity(patientName: string) {
  return `You are a senior functional-medicine nutritionist at Clinic Living Plus (CLP), talking through a patient case with a fellow coach — like two colleagues thinking out loud together.

The patient is "${patientName}". Always speak ABOUT the patient in the third person ("${patientName} reports…", "her glucose…"). NEVER address the patient ("what is your…") — you are talking to a coach, not the patient.

HOW TO REPLY — this matters most:
- Keep it SHORT and conversational — a few plain sentences, like you're chatting, not writing a report.
- Raise ONE point or idea at a time. Do not dump everything at once.
- After making your point, ASK the coach what they think, or offer a next angle to explore — e.g. "Want me to go deeper on that?" or "Does that match what you're seeing with her?"
- NO tables. NO markdown tables ever. NO long numbered protocols. NO drug dosing charts unless the coach explicitly asks for specifics.
- Plain language. If you use a mechanism, explain it in one short sentence.
- Be a real thinking partner: if the coach's idea has a gap or risk, say so gently and why — then suggest how to adjust. Don't just agree.
- Only go deep or give a full protocol when the coach directly asks for it. Otherwise, keep the conversation flowing one step at a time.`;
}

function friendlyError(err: any) {
  console.error('qa-chat request failed:', err?.message || err, err?.error ?? '');
  const status = err?.status || 500;
  if (status === 413 || status === 429 || err?.error?.error?.code === 'rate_limit_exceeded') {
    return Response.json(
      { error: 'This transcript is long for the free tier. It has been trimmed automatically — if this keeps happening, wait a minute and retry, or shorten the transcript.' },
      { status: 200 } // return 200 so the UI shows the message instead of a hard failure
    );
  }
  return Response.json({ error: 'The clinical co-pilot could not respond. Try again.' }, { status: 500 });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { mode, patientName = 'the patient', messages = [] } = body;
    const transcript = trimToBudget(body.transcript || '', MAX_TRANSCRIPT_CHARS);
    const geminiSummary = trimToBudget(body.geminiSummary || '', MAX_GEMINI_SUMMARY_CHARS);
    // Gemini's summary is a secondary reference the model cross-checks against the
    // transcript — never trust it alone, and never just restate it.
    const geminiSummaryBlock = geminiSummary
      ? `\n\nGemini's own auto-generated meeting summary (secondary reference — may be incomplete or miss things; cross-check against the transcript above, don't just restate it):\n\n${geminiSummary}`
      : '';

    if (mode === 'summary') {
      try {
        const summaryRequest = {
          model: MODEL_FAST,
          temperature: 0.4,
          max_tokens: 1400, // was 1024 (then 2048, which blew the TPM budget) —
          // Groq's json_object mode hard-fails (400 json_validate_failed) if
          // max_tokens runs out before valid JSON closes, unlike a normal
          // completion which just returns truncated text. But Groq reserves the
          // FULL max_tokens as "requested" tokens against the per-minute limit,
          // so this can't just be raised freely — reasoning_effort:'low' below
          // does more of the real work here by keeping the model from burning
          // tokens on internal reasoning before it starts writing the JSON.
          reasoning_effort: 'low' as const, // this is a well-defined extraction task,
          // not conditional-logic-following (unlike chat mode) — low reasoning effort
          // here reduces wasted internal-reasoning tokens without hurting output quality.
          response_format: { type: 'json_object' as const }, // forces valid, closed JSON instead of prose-wrapped output
          messages: [
            {
              role: 'system' as const,
              content: `${baseIdentity(patientName)}

TASK: You have the full transcript (ground truth) and, if provided, Gemini's own
auto-generated meeting summary (a secondary reference that may be incomplete or
miss things). Cross-check the two: build ONE clean, complete clinical summary
covering every relevant point from the transcript — don't just restate Gemini's
summary, and don't repeat the same point twice. If Gemini's summary is missing
something the transcript covers, fold it in; if Gemini's summary already says
something correctly, don't say it again in different words.

Return STRICT JSON only, no markdown:
{
  "summary": "3-4 sentence clinical summary of ${patientName}'s main concerns and relevant findings, third person",
  "checklist": ["4 to 6 of ${patientName}'s concerns from the transcript, ordered by CLINICAL URGENCY/SEVERITY — most pressing first (e.g. an acute or worsening symptom before a general lifestyle habit). Each one phrased as a specific coaching discussion point, not a question to the patient."],
  "goal": "ONE motivating, forward-looking sentence for the cover of ${patientName}'s wellness guide — written as the OUTCOME they're working toward, not a restatement of their problem. NEVER phrase it as the diagnosis/complaint (e.g. NOT 'Difficulty losing weight and gut inflammation'). Instead say what life looks like once this is handled (e.g. 'Lose the extra weight for good and feel steady all day, every day'). Plain language, no clinical terms, under 15 words.",
  "coach_quote": "ONE short, warm sentence in the COACH'S own voice, speaking directly to ${patientName} — built around ONE concrete, specific, non-clinical detail they actually mentioned in the transcript (a food ritual, a person, a routine, a small preference). Format like: '[First name] — I remember what you said about ___. That's exactly...'. This must be grounded in something explicitly said in the transcript — if nothing sufficiently specific and personal was mentioned, return an empty string. Never invent a detail that wasn't in the transcript."
}`,
            },
            { role: 'user' as const, content: `Transcript:\n\n${transcript}${geminiSummaryBlock}` },
          ],
        };

        // Same empty-completion quirk seen in chat mode — retry once more
        // specifically for that before giving up (separate from withRetry,
        // which only covers network/API-level failures, not blank success).
        let raw = '';
        for (let attempt = 0; attempt < 2 && !raw.trim(); attempt++) {
          const completion = await withRetry(() => groq.chat.completions.create(summaryRequest));
          raw = completion.choices[0]?.message?.content || '';
          if (!raw.trim()) console.log(`[qa-chat debug] summary empty content (attempt ${attempt + 1}/2), finish_reason:`, completion.choices[0]?.finish_reason);
        }
        raw = raw || '{}';
        let parsed: { summary?: string; checklist?: string[]; goal?: string; coach_quote?: string } = {};
        // Robustly pull JSON out even if the model wraps it in prose or ``` fences.
        try {
          const clean = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
          const match = clean.match(/\{[\s\S]*\}/); // grab the first {...} block
          parsed = JSON.parse(match ? match[0] : clean);
        } catch {
          parsed = {};
        }
        // Guarantee clean shapes — never return raw JSON as the summary text.
        let summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
        const goal = typeof parsed.goal === 'string' ? parsed.goal.trim() : '';
        const coachQuote = typeof parsed.coach_quote === 'string' ? parsed.coach_quote.trim() : '';
        const checklistItems = Array.isArray(parsed.checklist)
          ? parsed.checklist.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim())
          : [];
        // Priority order is the order the model returned them in — assign stable
        // indices now so status updates during the discussion can reference them.
        const checklist = checklistItems.map((text, index) => ({ index, text, priority: index + 1, status: 'pending' as const }));
        // If parsing failed entirely, say so — don't leak the mangled JSON as if it were the summary.
        if (!summary && !checklist.length) {
          return Response.json({ error: 'The case summary could not be parsed. Tap retry to regenerate.' });
        }
        return Response.json({ summary, checklist, goal, coachQuote });
      } catch (err) { return friendlyError(err); }
    }

    if (mode === 'chat') {
      try {
        type ChecklistItem = { index: number; text: string; priority: number; status: 'pending' | 'discussed' | 'deferred' };
        const checklist: ChecklistItem[] = Array.isArray(body.checklist) ? body.checklist : [];
        const isOpening = messages.length === 0;

        // Keep only the last ~8 turns so the running context stays under budget.
        // Strip everything but role/content — the client attaches a "sources"
        // field to assistant messages (for the "Grounded in:" UI), and Groq's
        // API does strict schema validation that 400s on any unrecognized
        // property, permanently breaking every request once one such message
        // enters the conversation history.
        const trimmedMessages = messages.slice(-8).map((m: any) => ({ role: m.role, content: m.content }));
        // Short conversational replies ("yes", "she has dumbbells") carry almost
        // no searchable clinical vocabulary on their own — fold in the prior
        // assistant turn's content so the query still carries the topic being
        // discussed, instead of silently finding nothing to ground on. On the
        // opening turn there's no conversation yet, so ground on the top
        // pending checklist item instead — that's what the AI is about to ask.
        const lastUserIdx = trimmedMessages.map((m: any) => m.role).lastIndexOf('user');
        const latestUserMsg = trimmedMessages[lastUserIdx]?.content || '';
        const priorAssistantMsg = lastUserIdx > 0 && trimmedMessages[lastUserIdx - 1]?.role === 'assistant'
          ? trimmedMessages[lastUserIdx - 1].content
          : '';
        const topPendingItem = checklist.find((c) => c.status === 'pending');
        // Only blend in the prior assistant turn when the coach's own message is
        // genuinely thin (a handful of words) — a real, self-contained question
        // should be searched on its own content. Blending unconditionally meant
        // the exact same detailed question could retrieve totally different (or
        // zero) results depending on whatever unrelated topic preceded it.
        const isThinMessage = latestUserMsg.trim().split(/\s+/).filter(Boolean).length <= 6;
        const latestQuestion = isOpening
          ? (topPendingItem?.text || '')
          : (isThinMessage ? `${priorAssistantMsg} ${latestUserMsg}`.trim() : latestUserMsg);
        // KB retrieval is a bonus, not a dependency — under DB load the unindexed
        // fallback path has been observed taking 3.5s-43s+, which must never be
        // allowed to block the actual reply. Race it against a hard cutoff.
        const kbTimeout = new Promise<{ kbContext: string; sources: KbSource[] }>((resolve) =>
          setTimeout(() => resolve({ kbContext: '', sources: [] }), 5000)
        );
        const { kbContext, sources } = await Promise.race([retrieveKbContext(latestQuestion), kbTimeout]);
        // Strict KB-grounding rules: answer ONLY from the retrieved excerpts when
        // they exist. When nothing was retrieved, don't quietly fall back to
        // general knowledge — say so, and only answer generally if the coach
        // explicitly asks for that despite the gap (signaled via a literal
        // [GENERAL] marker token so the server can flag it for the UI).
        const kbBlock = kbContext
          ? `\n\nKNOWLEDGE BASE EXCERPTS (this is your source of truth for this reply — answer using ONLY these, don't introduce clinical claims they don't support):\n\n${kbContext}`
          : '';
        // Shared "miss" behavior — applies whether nothing was retrieved at all,
        // or something was retrieved but doesn't actually address the question.
        // The two marker tokens are mutually exclusive: [GENERAL] means "coach
        // already explicitly asked me to answer generally despite the gap, so
        // I'm doing that now" (works regardless of why there's a gap); [NO_MATCH]
        // means "retrieved excerpts were irrelevant and I'm NOT answering
        // generally — I'm asking for clarification / offering alternatives
        // instead". Never emit both.
        const missInstructions = `HARD RULE: unless the coach's latest message already explicitly asked you to proceed anyway with a general/best-practice answer despite the gap (e.g. "yes give me general advice", "that's fine, go ahead") — your reply must NOT contain any clinical recommendation, protocol, or advice of any kind. Not one bullet point, not "here's a quick approach," nothing. This is the single most-violated rule, so check it twice: if you're about to write a recommendation and you weren't just given permission, stop and delete it. Your entire reply must be just: tell the coach plainly this specific point isn't covered in the current knowledge base, then either ask a clarifying question or offer 2-3 concrete alternative angles to explore instead. That's it.
If the coach WAS just given permission (per the exception above), your reply MUST start with the literal token "[GENERAL]" as the very first characters, nothing before it — and even then, stay short and conversational per your core instructions: one point, plain sentences, no bulleted lists or multi-step protocols, same as any other reply.
If the coach's message is just a conversational continuation ("yes" to a plan, logistics) that doesn't actually need new factual grounding, respond naturally and don't mention the knowledge base or use any marker at all.`;
        const groundingRule = kbContext
          ? `\n\nGROUNDING RULE: First check whether the knowledge base excerpts above actually address the coach's specific question — the search that found them is keyword-based and imperfect, so they may be irrelevant. If they DO address it, base your reply strictly on them, don't introduce clinical claims they don't support. If they DON'T (wrong topic entirely) and you are not giving a general answer per the rule below, your reply must start with the literal token "[NO_MATCH]" as the very first characters. Either way, if treating this as a miss: ${missInstructions}`
          : `\n\nGROUNDING RULE: No knowledge base material was found for this question. If it's a genuine factual/clinical question: ${missInstructions}`;

        // Checklist-driven leading: you (the senior coach) drive this discussion
        // through ${patientName}'s concerns in priority order, one at a time —
        // the junior coach responds, they don't pick the topics.
        let checklistRule = '';
        if (checklist.length) {
          const stateLines = checklist.map((c) => `${c.index}. [${c.status}] ${c.text}`).join('\n');
          const pendingCount = checklist.filter((c) => c.status === 'pending').length;
          const deferredCount = checklist.filter((c) => c.status === 'deferred').length;
          checklistRule = `\n\nCHECKLIST — you are leading this discussion through these concerns, in priority order (most clinically urgent first):
${stateLines}

HOW TO LEAD:
- Work through "pending" items in the order listed, one at a time. Ask about ONE item, then have a real back-and-forth about it — don't rush to the next item while the coach is still engaging with the current one.
- HARD RULE, no exceptions: the moment your reply's main topic shifts away from the item you were just discussing — to a new item, or circling back to a deferred one — that reply MUST begin with \`[CHECKLIST_UPDATE:{"index":N,"status":"discussed"}]\` or \`[CHECKLIST_UPDATE:{"index":N,"status":"deferred"}]\`, where N is the item you're LEAVING (not the one you're moving to). This is mechanical, not optional: if you're about to talk about a different item than last turn, you already forgot the marker — go back and add it. The app has no other way to know an item is resolved. If you're continuing the SAME item as last turn, don't use any marker.
- ${pendingCount > 0 ? `There ${pendingCount === 1 ? 'is' : 'are'} ${pendingCount} pending item(s) left.` : deferredCount > 0 ? `No pending items left, but ${deferredCount} were deferred — circle back to the highest-priority deferred one now ("Let's come back to X you weren't sure about earlier...") using the same marker mechanism when it's resolved.` : 'Every item has been covered. Congratulate the coach briefly and ask if they want to draft roadmap instructions from this discussion now.'}
- Never mention "checklist" or "index numbers" to the coach — just lead the conversation naturally, like a senior coach who has a mental list of what to cover.`;
        }

        const chatRequest = {
          model: MODEL_CHAT,
          temperature: 0.3, // was 0.6 — this now follows conditional grounding/marker
          // logic, not just free conversation; lower temperature makes that
          // instruction-following meaningfully more consistent.
          max_tokens: 600, // was 350 — the grounding rules made this a reasoning-heavy
          // prompt, and gpt-oss models can burn their whole token budget on internal
          // reasoning before producing visible output, hitting finish_reason:'length'
          // with empty content.
          messages: [
            { role: 'system' as const, content: `${baseIdentity(patientName)}\n\nConsultation transcript (may be trimmed):\n\n${transcript}${geminiSummaryBlock}${kbBlock}${groundingRule}${checklistRule}` },
            ...trimmedMessages,
            // No conversation yet — this nudges the model to open with the top
            // checklist item without ever appearing in the visible chat (only
            // the assistant's reply gets shown/persisted, never this message).
            ...(isOpening ? [{ role: 'user' as const, content: '(Begin the discussion by raising the highest-priority item on the checklist.)' }] : []),
          ],
        };

        // Some open-weight models occasionally return genuinely empty content
        // (nothing to do with rate limits/network errors, so withRetry's own
        // retry doesn't cover it) — retry once more specifically for that.
        let reply = '';
        for (let attempt = 0; attempt < 2 && !reply.trim(); attempt++) {
          const completion = await withRetry(() => groq.chat.completions.create(chatRequest));
          reply = completion.choices[0]?.message?.content || '';
          if (!reply.trim()) console.log(`[qa-chat debug] empty content (attempt ${attempt + 1}/2), finish_reason:`, completion.choices[0]?.finish_reason);
        }
        if (!reply.trim()) reply = "I didn't get a clear answer that time — could you try rephrasing, or ask again?";

        let generalAnswer = false;
        let effectiveSources = sources;
        if (reply.startsWith('[GENERAL]')) {
          // This answer is explicitly NOT based on the KB — clear sources so
          // the UI doesn't misleadingly show them as this reply's grounding.
          generalAnswer = true;
          effectiveSources = [];
          reply = reply.replace(/^\[GENERAL\]\s*/, '');
        } else if (reply.startsWith('[NO_MATCH]')) {
          // The model judged the retrieved excerpts irrelevant to this specific
          // question — treat it as a miss rather than showing misleading sources.
          reply = reply.replace(/^\[NO_MATCH\]\s*/, '');
          effectiveSources = [];
        }

        // Parse and apply a checklist status update, if the model emitted one.
        let updatedChecklist = checklist;
        const checklistMatch = reply.match(/^\[CHECKLIST_UPDATE:(\{[^}]*\})\]\s*/);
        if (checklistMatch) {
          reply = reply.replace(checklistMatch[0], '');
          try {
            const update = JSON.parse(checklistMatch[1]) as { index: number; status: 'discussed' | 'deferred' };
            updatedChecklist = checklist.map((c) => (c.index === update.index ? { ...c, status: update.status } : c));
          } catch {
            // Malformed marker — ignore it and leave checklist state unchanged
            // rather than failing the whole reply over a formatting slip.
          }
        }

        const kbMiss = !effectiveSources.length && !generalAnswer;
        return Response.json({ reply, sources: effectiveSources, generalAnswer, kbMiss, checklist: updatedChecklist });
      } catch (err) { return friendlyError(err); }
    }

    if (mode === 'draft') {
      try {
        const completion = await withRetry(() => groq.chat.completions.create({
          model: MODEL_FAST,
          temperature: 0.3,
          max_tokens: 700,
          messages: [
            {
              role: 'system',
              content: `${baseIdentity(patientName)}

TASK: Condense the discussion below into clear ROADMAP INSTRUCTIONS for ${patientName} — focus areas, priorities, constraints, and emphasis for the roadmap generator. Directive bullet points, no preamble.`,
            },
            { role: 'user', content: `Discussion:\n\n${messages.slice(-10).map((m: any) => `${m.role === 'user' ? 'Coach' : 'Co-pilot'}: ${m.content}`).join('\n\n')}` },
          ],
        }));
        return Response.json({ instructions: completion.choices[0]?.message?.content || '' });
      } catch (err) { return friendlyError(err); }
    }

    return Response.json({ error: 'Unknown mode' }, { status: 400 });
  } catch (err) {
    console.error('qa-chat error:', err);
    return friendlyError(err);
  }
}