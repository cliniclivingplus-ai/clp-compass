// One-off: bulk-ingests every output/lifestyle/*.txt file (the non-recipe
// pages extract.js pulled out — routines, guidelines, protocols) into the
// same kb_documents/kb_chunks knowledge base scripts/ingest-kb.mjs feeds,
// as source_type 'guideline'. This is the real content that grounds
// roadmap generation and the QA chat in each coach's actual protocols
// instead of generic advice — never fabricated, straight from the PDFs.
//
// Run manually from your machine: node scripts/pdf-extract/ingest-lifestyle.mjs
// Safe to stop and re-run — anything already ingested (matched by a stable
// synthetic source_url derived from the filename) is skipped.
//
// Embeddings run locally via @xenova/transformers, same model already used
// elsewhere in this project — no API key, no rate limits, just CPU time.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { pipeline } from '@xenova/transformers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIFESTYLE_DIR = path.join(__dirname, 'output', 'lifestyle');

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '..', '.env.local');
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnvLocal();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const CHUNK_WORDS = 400;
const CHUNK_OVERLAP = 60;
const EMBED_BATCH_SIZE = 16;

function chunkText(text, chunkSize = CHUNK_WORDS, overlap = CHUNK_OVERLAP) {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks = [];
  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    chunks.push(words.slice(i, i + chunkSize).join(' '));
    if (i + chunkSize >= words.length) break;
  }
  return chunks.length ? chunks : [text];
}

function titleFromFileName(fileName) {
  return fileName
    .replace(/\.txt$/, '')
    .replace(/_/g, ' ')
    .trim();
}

let embedderPromise = null;
function getEmbedder() {
  if (!embedderPromise) embedderPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  return embedderPromise;
}

async function embedBatch(texts) {
  const model = await getEmbedder();
  const output = await model(texts, { pooling: 'mean', normalize: true });
  const dim = output.dims[output.dims.length - 1];
  const vectors = [];
  for (let i = 0; i < texts.length; i++) {
    vectors.push(Array.from(output.data.slice(i * dim, (i + 1) * dim)));
  }
  return vectors;
}

async function loadIngestedUrls() {
  const urls = new Set();
  let from = 0;
  const PAGE = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from('kb_documents').select('source_url')
      .not('source_url', 'is', null)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`loadIngestedUrls: ${error.message}`);
    for (const row of data) urls.add(row.source_url);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return urls;
}

async function ingestDocument({ title, sourceUrl, content }) {
  content = content.replace(/\s+/g, ' ').trim();
  if (content.length < 50) return { skipped: 'too short' };

  const { data: doc, error: docErr } = await supabase
    .from('kb_documents')
    .insert({ title, source_type: 'guideline', content, tags: [], source_url: sourceUrl })
    .select('id').single();
  if (docErr) return { error: docErr.message };

  const chunks = chunkText(content);
  const chunkRows = [];
  for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
    const vectors = await embedBatch(batch);
    batch.forEach((c, j) => {
      chunkRows.push({ document_id: doc.id, chunk_index: i + j, content: c, embedding: `[${vectors[j].join(',')}]` });
    });
  }
  const { error: chunkErr } = await supabase.from('kb_chunks').insert(chunkRows);
  if (chunkErr) return { error: `chunks: ${chunkErr.message}` };
  return { chunks: chunks.length };
}

async function main() {
  if (!fs.existsSync(LIFESTYLE_DIR)) {
    console.log(`No ${LIFESTYLE_DIR} folder — run extract.js first.`);
    return;
  }
  console.log('Loading already-ingested source_urls for dedup...');
  const seenUrls = await loadIngestedUrls();
  console.log(`Found ${seenUrls.size} already ingested — will be skipped.`);

  const files = fs.readdirSync(LIFESTYLE_DIR).filter((f) => f.endsWith('.txt'));
  console.log(`\nFound ${files.length} lifestyle/guideline file(s) in ${LIFESTYLE_DIR}`);

  const counters = { total: 0, ingested: 0, skipped: 0, errors: 0 };
  for (const file of files) {
    counters.total++;
    const sourceUrl = `pdf-extract:${file}`;
    if (seenUrls.has(sourceUrl)) { counters.skipped++; continue; }

    const content = fs.readFileSync(path.join(LIFESTYLE_DIR, file), 'utf-8');
    const title = titleFromFileName(file);
    const result = await ingestDocument({ title, sourceUrl, content });
    seenUrls.add(sourceUrl);
    if (result.error) { counters.errors++; console.error(`  ERROR ${title}: ${result.error}`); }
    else if (result.skipped) { counters.skipped++; console.log(`  SKIP "${title}" (${result.skipped})`); }
    else { counters.ingested++; console.log(`  OK "${title}" (${result.chunks} chunks)`); }
  }

  console.log(`\n=== DONE: ${counters.total} processed, ${counters.ingested} ingested, ${counters.skipped} skipped, ${counters.errors} errors ===`);
}

main().catch((err) => { console.error('Fatal error:', err); process.exit(1); });
