#!/usr/bin/env node
// Standalone CLI — run this yourself in a terminal, it never talks to Claude.
//
// Usage:
//   npm install
//   node extract.js "D:\path\to\PDF folder" ["D:\another\folder" ...] [--out ./output] [--force]
//
// For every .pdf found (recursively) in the given folder(s):
//   1. Pulls real text per page via `pdftotext -layout` (column-aware, so a
//      recipe's ingredients/directions two-column layout doesn't get
//      scrambled) — requires pdftotext on PATH (comes with Git for Windows /
//      poppler; already confirmed present on this machine).
//   2. Pulls the actual embedded hero photo per page directly from the PDF
//      (no page rendering or cropping) via pdfjs-dist, discarding any image
//      that repeats across multiple pages — that's always template
//      decoration (a background illustration, a logo watermark), never a
//      genuine recipe photo.
//   3. Sends each page's text to Groq to pull out any real recipe on it,
//      grounded strictly in what's actually written — never inventing a
//      field. A page with no recipe (routine steps, guideline bullets,
//      an index table) correctly returns nothing.
//   4. Merges a same-named recipe found on consecutive pages of one file
//      (a recipe that spans 2 pages), then deduplicates identically-named
//      recipes across ALL files, keeping the most complete version and
//      recording every source file/page it came from.
//   5. Writes local files only — nothing is sent to Supabase or the live
//      app. Recipes go to output/recipes-ready-for-review.json (+ one PNG
//      per recipe in output/images/); non-recipe pages (routines,
//      guidelines, protocols) go to output/lifestyle/<file>.txt — those
//      .txt files can be uploaded as-is through the app's existing
//      Knowledge Base page (/knowledge-base) once you're ready.
//
// Safe to re-run: a PDF whose output/recipes/<slug>.json already exists is
// skipped (pass --force to redo everything).

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const crypto = require('crypto')

const { createCanvas, ImageData } = require('canvas')
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js')
const Groq = require('groq-sdk')

// ── CLI args ────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const folders = []
let outDir = path.join(__dirname, 'output')
let force = false
let provider = 'groq' // --provider groq|gemini — which one to use FIRST
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') { outDir = path.resolve(args[++i]); continue }
  if (args[i] === '--force') { force = true; continue }
  if (args[i] === '--provider') { provider = args[++i]; continue }
  folders.push(path.resolve(args[i]))
}
if (folders.length === 0) {
  console.error('Usage: node extract.js "<pdf folder>" [more folders...] [--out ./output] [--force] [--provider groq|gemini]')
  process.exit(1)
}
if (provider !== 'groq' && provider !== 'gemini') {
  console.error(`--provider must be "groq" or "gemini", got "${provider}"`)
  process.exit(1)
}

// ── API keys: env var, or a local .env, or the main app's .env.local ──────
function loadKey(envName) {
  if (process.env[envName]) return process.env[envName]
  const candidates = [path.join(__dirname, '.env'), path.join(__dirname, '..', '..', '.env.local')]
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue
    const m = fs.readFileSync(p, 'utf8').match(new RegExp(`^${envName}=(.+)$`, 'm'))
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  }
  return null
}
const GROQ_API_KEY = loadKey('GROQ_API_KEY')
const GEMINI_API_KEY = loadKey('GEMINI_API_KEY')
if (provider === 'groq' && !GROQ_API_KEY) {
  console.error('No GROQ_API_KEY found. Put one in scripts/pdf-extract/.env as GROQ_API_KEY=..., or set it as an environment variable.')
  process.exit(1)
}
if (provider === 'gemini' && !GEMINI_API_KEY) {
  console.error('No GEMINI_API_KEY found. Put one in scripts/pdf-extract/.env as GEMINI_API_KEY=..., or set it as an environment variable.')
  process.exit(1)
}
const groq = GROQ_API_KEY ? new Groq({ apiKey: GROQ_API_KEY }) : null
// Groq's free tier has a hard DAILY token cap. Once hit, every single call
// fails until it resets (the API tells us how long) — retrying page by page
// wastes time and never helps. So instead of retrying per-page, the first
// time we see this specific error, we switch providers for the rest of the
// whole run (if Gemini's available) rather than trying Groq again at all.
let activeProvider = provider
const canFallbackToGemini = provider === 'groq' && !!GEMINI_API_KEY
console.log('='.repeat(70))
console.log(`Provider: ${provider}` + (provider === 'groq' ? (canFallbackToGemini ? ' (Gemini fallback: ENABLED — will auto-switch if Groq hits its daily limit)' : ' (Gemini fallback: not set up — add GEMINI_API_KEY to scripts/pdf-extract/.env to enable it)') : ''))
console.log('='.repeat(70))

// ── output dirs ─────────────────────────────────────────────────────────
const RECIPES_DIR = path.join(outDir, 'recipes')       // one JSON per source PDF
const IMAGES_DIR = path.join(outDir, 'images')          // one PNG per source PDF, per page
const LIFESTYLE_DIR = path.join(outDir, 'lifestyle')    // one .txt per source PDF (non-recipe pages)
for (const d of [RECIPES_DIR, IMAGES_DIR, LIFESTYLE_DIR]) fs.mkdirSync(d, { recursive: true })

function slugify(name) {
  return name.replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80)
}

function findPdfs(dirs) {
  const out = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) out.push(full)
    }
  }
  for (const d of dirs) walk(d)
  return out
}

// ── locate pdftotext (Git for Windows ships it, but plain cmd.exe doesn't
// put it on PATH the way Git Bash does) ───────────────────────────────────
function resolvePdftotext() {
  const candidates = [
    'pdftotext', // already on PATH (Git Bash, most Linux/Mac setups)
    'C:\\Program Files\\Git\\mingw64\\bin\\pdftotext.exe',
    'C:\\Program Files (x86)\\Git\\mingw64\\bin\\pdftotext.exe',
  ]
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ['-v'], { stdio: 'ignore' })
      return candidate
    } catch (e) {
      // pdftotext -v exits non-zero (e.g. code 99) even when it ran fine —
      // only ENOENT actually means "this binary doesn't exist here."
      if (e.code !== 'ENOENT') return candidate
    }
  }
  console.error(
    'Could not find pdftotext. It ships with Git for Windows (usually at ' +
    'C:\\Program Files\\Git\\mingw64\\bin\\pdftotext.exe) — either run this ' +
    'script from Git Bash, or install Git for Windows, or install poppler ' +
    'and make sure pdftotext is on your PATH.'
  )
  process.exit(1)
}
const PDFTOTEXT = resolvePdftotext()

// ── text extraction (pdftotext -layout, page-split on form-feed) ─────────
function extractPageTexts(pdfPath) {
  const raw = execFileSync(PDFTOTEXT, ['-layout', pdfPath, '-'], { maxBuffer: 1024 * 1024 * 64 }).toString('utf8')
  return raw.split('\f')
}

// ── hero image extraction (direct embedded-image pull, dedup decoration) ──
function toPngBuffer(img) {
  const { width, height, data: pixels } = img
  const total = width * height
  let rgba
  if (pixels.length === total * 4) rgba = pixels
  else if (pixels.length === total * 3) {
    rgba = new Uint8ClampedArray(total * 4)
    for (let p = 0; p < total; p++) { rgba[p * 4] = pixels[p * 3]; rgba[p * 4 + 1] = pixels[p * 3 + 1]; rgba[p * 4 + 2] = pixels[p * 3 + 2]; rgba[p * 4 + 3] = 255 }
  } else if (pixels.length === total) {
    rgba = new Uint8ClampedArray(total * 4)
    for (let p = 0; p < total; p++) { rgba[p * 4] = pixels[p]; rgba[p * 4 + 1] = pixels[p]; rgba[p * 4 + 2] = pixels[p]; rgba[p * 4 + 3] = 255 }
  } else return null
  const canvas = createCanvas(width, height)
  canvas.getContext('2d').putImageData(new ImageData(rgba, width, height), 0, 0)
  return canvas.toBuffer('image/png')
}

async function extractHeroImagesByPage(pdfPath) {
  const data = new Uint8Array(fs.readFileSync(pdfPath))
  const doc = await pdfjsLib.getDocument({ data, disableFontFace: true }).promise
  const perPage = []
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum)
    const opList = await page.getOperatorList()
    const names = new Set()
    for (let i = 0; i < opList.fnArray.length; i++) {
      if (opList.fnArray[i] === pdfjsLib.OPS.paintImageXObject || opList.fnArray[i] === pdfjsLib.OPS.paintJpegXObject) {
        const arg = opList.argsArray[i][0]
        if (typeof arg === 'string') names.add(arg)
      }
    }
    const images = []
    for (const name of names) {
      try {
        const img = await new Promise((resolve, reject) => { try { page.objs.get(name, resolve) } catch (e) { reject(e) } })
        if (!img || !img.width || !img.height) continue
        const buf = toPngBuffer(img)
        if (!buf) continue
        images.push({ width: img.width, height: img.height, hash: crypto.createHash('md5').update(buf).digest('hex'), buf })
      } catch { /* unreadable image, skip */ }
    }
    perPage.push({ pageNum, images })
  }
  const hashCounts = new Map()
  for (const { images } of perPage) for (const img of images) hashCounts.set(img.hash, (hashCounts.get(img.hash) || 0) + 1)

  const heroByPage = new Map()
  for (const { pageNum, images } of perPage) {
    const unique = images.filter((img) => hashCounts.get(img.hash) === 1)
    if (unique.length === 0) continue
    unique.sort((a, b) => b.width * b.height - a.width * a.height)
    heroByPage.set(pageNum, unique[0])
  }
  return heroByPage
}

// ── Groq recipe extraction, one page at a time ────────────────────────────
const RECIPE_SYSTEM = `You extract real recipes from one page of raw text pulled from a nutrition coach's PDF. The page may contain zero, one, or more recipes, or no recipe at all (goals text, headers, routines, guideline bullets, an index/table of contents).

For each real recipe found, extract ONLY what's actually written — never invent or estimate a field that isn't in the text:
- name: the recipe's title as written
- meal_type: your best single guess from breakfast, lunch, dinner, snack, dessert, based on context (recipe name/ingredients/section header) — if genuinely ambiguous, use your best judgment, never leave blank
- servings: e.g. "2-3 servings" — omit field if not stated
- prep_time / cook_time: only if explicitly stated — omit if not stated (a single combined time can go in prep_time)
- ingredients: the ingredients list, one per line, exactly as written (keep quantities)
- steps: the directions/instructions, one step per line, exactly as written
- tags: 1-4 short lowercase tags only if the page text itself suggests them (e.g. a header like "ANTI-INFLAMMATORY", explicit diet labels) — do not invent generic tags
- benefits: only if the page has an explicit "why it works" / benefits note — omit otherwise

If a recipe's ingredients or directions look cut off at the end of the page (continues onto the next page), still extract what's on this page — a later merge step stitches split recipes back together by matching name on consecutive pages.

If the page has no real recipe on it, return an empty recipes array.

Respond with strict JSON only: {"recipes": [{"name": "...", "meal_type": "...", "servings": "...", "prep_time": "...", "cook_time": "...", "ingredients": "...", "steps": "...", "tags": [...], "benefits": [...]}]}`

function isDailyQuotaError(e) {
  const msg = (e?.error?.message || e?.message || '').toLowerCase()
  return msg.includes('tokens per day') || msg.includes('tpd') || msg.includes('per day')
}

// A short, capped retry loop for genuinely transient errors. A daily-quota
// error is NOT retried at all here — it won't clear for many minutes, so
// the caller (structurePage) switches providers for the rest of the run
// instead of wasting time retrying a call that can't succeed yet.
async function callGroq(messages, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const completion = await groq.chat.completions.create({
        model: 'openai/gpt-oss-20b', temperature: 0.1, max_tokens: 3000, reasoning_effort: 'low',
        response_format: { type: 'json_object' }, messages,
      })
      return completion.choices[0]?.message?.content?.trim() || ''
    } catch (e) {
      const status = e?.status || e?.response?.status
      if (status === 429 && isDailyQuotaError(e)) throw e // no point retrying, caller switches provider
      if ((status === 429 || status >= 500) && attempt < maxRetries) {
        const wait = Math.min(10000, 1000 * 2 ** attempt)
        console.log(`  Groq ${status}, retrying in ${wait / 1000}s...`)
        await new Promise((r) => setTimeout(r, wait))
        continue
      }
      throw e
    }
  }
}

// "gemini-2.0-flash" reports a hard 0 free-tier quota on some keys/projects
// (Google's free-tier model grants vary by key) — "gemini-flash-latest" is
// the alias that's actually confirmed working on the free tier here.
const GEMINI_MODEL = 'gemini-flash-latest'
// The free tier is limited per MINUTE (unlike Groq's per-DAY cap), so unlike
// Groq this really is worth waiting out — but the script was firing one
// request right after another with no spacing, which alone is enough to
// blow through a ~15/minute budget. This enforces a floor between the
// START of consecutive Gemini calls so most 429s never happen in the first
// place, and retries with patience (up to a minute) for the rest.
const GEMINI_MIN_INTERVAL_MS = 4500
let lastGeminiCallAt = 0
async function callGemini(systemPrompt, userText, maxRetries = 6) {
  const wait0 = GEMINI_MIN_INTERVAL_MS - (Date.now() - lastGeminiCallAt)
  if (wait0 > 0) await new Promise((r) => setTimeout(r, wait0))
  lastGeminiCallAt = Date.now()

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
  }
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) {
      const data = await res.json()
      return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
    }
    if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
      const wait = Math.min(65000, 2000 * 2 ** attempt)
      console.log(`  Gemini ${res.status}, retrying in ${wait / 1000}s...`)
      await new Promise((r) => setTimeout(r, wait))
      lastGeminiCallAt = Date.now()
      continue
    }
    const text = await res.text().catch(() => '')
    throw new Error(`Gemini ${res.status}: ${text.slice(0, 300)}`)
  }
}

async function structurePage(pageText) {
  if (!pageText.trim() || pageText.trim().length < 30) return []
  const userText = pageText.slice(0, 6000)
  let raw = ''
  if (activeProvider === 'gemini') {
    raw = await callGemini(RECIPE_SYSTEM, userText)
  } else {
    try {
      raw = await callGroq([{ role: 'system', content: RECIPE_SYSTEM }, { role: 'user', content: userText }])
    } catch (e) {
      if (!canFallbackToGemini) throw e
      // A daily-quota error won't clear for a long time — switch for the
      // rest of the run instead of trying (and failing) Groq on every
      // remaining page. Any other error is treated as one-off.
      if (isDailyQuotaError(e)) {
        activeProvider = 'gemini'
        console.log(`  Groq hit its daily limit — switching to Gemini for the rest of this run.`)
      } else {
        console.log(`  Groq error (${e.message.slice(0, 120)}) — using Gemini for this page`)
      }
      raw = await callGemini(RECIPE_SYSTEM, userText)
    }
  }
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed.recipes) ? parsed.recipes : []
  } catch { return [] }
}

function normalizeName(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

// Same recipe name on immediately-consecutive pages of the same file is
// almost always one recipe split across a page break, not two dishes that
// happen to share a title — merge their ingredients/steps together.
function mergeConsecutivePageSplits(pageRecipes) {
  // pageRecipes: [{ pageNum, recipes: [...] }] in page order
  const merged = []
  let last = null
  for (const { pageNum, recipes } of pageRecipes) {
    for (const r of recipes) {
      const key = normalizeName(r.name)
      if (last && last.key === key && pageNum === last.pageNum + 1) {
        last.recipe.ingredients = [last.recipe.ingredients, r.ingredients].filter(Boolean).join('\n')
        last.recipe.steps = [last.recipe.steps, r.steps].filter(Boolean).join('\n')
        last.pageNum = pageNum
        continue
      }
      const entry = { key, pageNum, recipe: r }
      merged.push(entry)
      last = entry
    }
  }
  return merged.map((e) => ({ pageNum: e.pageNum, recipe: e.recipe }))
}

// ── per-PDF pipeline ────────────────────────────────────────────────────
async function processPdf(pdfPath) {
  const fileName = path.basename(pdfPath)
  const slug = slugify(fileName)
  const outJson = path.join(RECIPES_DIR, `${slug}.json`)
  if (fs.existsSync(outJson) && !force) {
    console.log(`skip (already done): ${fileName}`)
    return JSON.parse(fs.readFileSync(outJson, 'utf8'))
  }

  console.log(`\n=== ${fileName} ===`)
  const pageTexts = extractPageTexts(pdfPath)
  console.log(`  ${pageTexts.length} pages`)

  let heroByPage
  try {
    heroByPage = await extractHeroImagesByPage(pdfPath)
  } catch (e) {
    console.log(`  image extraction failed (continuing without photos): ${e.message}`)
    heroByPage = new Map()
  }

  const perPageRecipes = []
  const lifestyleChunks = []
  for (let i = 0; i < pageTexts.length; i++) {
    const pageNum = i + 1
    const text = pageTexts[i]
    let recipes = []
    try {
      recipes = await structurePage(text)
    } catch (e) {
      console.log(`  page ${pageNum}: ${activeProvider} error — ${e.message}`)
    }
    if (recipes.length) {
      console.log(`  page ${pageNum}: ${recipes.map((r) => r.name).join(', ')}`)
      perPageRecipes.push({ pageNum, recipes })
    } else if (text.trim().length > 30) {
      lifestyleChunks.push(`--- page ${pageNum} ---\n${text.trim()}`)
    }
  }

  const mergedRecipes = mergeConsecutivePageSplits(perPageRecipes)
  const imageDir = path.join(IMAGES_DIR, slug)
  const finalRecipes = mergedRecipes.map(({ pageNum, recipe }, idx) => {
    let imagePath = null
    const hero = heroByPage.get(pageNum)
    if (hero) {
      fs.mkdirSync(imageDir, { recursive: true })
      imagePath = path.join(imageDir, `${idx + 1}_${slugify(recipe.name)}.png`)
      fs.writeFileSync(imagePath, hero.buf)
    }
    return { ...recipe, _sourceFile: fileName, _sourcePage: pageNum, _imagePath: imagePath }
  })

  fs.writeFileSync(outJson, JSON.stringify(finalRecipes, null, 2))
  if (lifestyleChunks.length) {
    fs.writeFileSync(path.join(LIFESTYLE_DIR, `${slug}.txt`), lifestyleChunks.join('\n\n'))
  }
  console.log(`  -> ${finalRecipes.length} recipe(s), ${lifestyleChunks.length} lifestyle page(s)`)
  return finalRecipes
}

// ── cross-file dedup ───────────────────────────────────────────────────
function dedupeAcrossFiles(allRecipes) {
  const byName = new Map()
  for (const r of allRecipes) {
    const key = normalizeName(r.name)
    if (!key) continue
    const completeness = (r.ingredients || '').length + (r.steps || '').length
    const existing = byName.get(key)
    if (!existing) {
      byName.set(key, { ...r, _sources: [{ file: r._sourceFile, page: r._sourcePage }], _completeness: completeness })
      continue
    }
    existing._sources.push({ file: r._sourceFile, page: r._sourcePage })
    if (completeness > existing._completeness) {
      const sources = existing._sources
      byName.set(key, { ...r, _sources: sources, _completeness: completeness })
    }
  }
  return [...byName.values()].map(({ _completeness, ...r }) => r)
}

// ── main ────────────────────────────────────────────────────────────────
async function main() {
  const pdfs = findPdfs(folders)
  console.log(`Found ${pdfs.length} PDF(s) across ${folders.length} folder(s).`)
  if (pdfs.length === 0) return

  const failed = []
  const allRecipes = []
  for (let i = 0; i < pdfs.length; i++) {
    console.log(`\n[${i + 1}/${pdfs.length}]`)
    const fileName = path.basename(pdfs[i])
    if (!fileName || fileName === '.pdf' || fs.statSync(pdfs[i]).size === 0) {
      console.log(`skip (not a real PDF): ${pdfs[i]}`)
      continue
    }
    try {
      const recipes = await processPdf(pdfs[i])
      allRecipes.push(...recipes)
    } catch (e) {
      console.log(`  FAILED — skipping this file and continuing: ${e.message}`)
      failed.push(fileName)
    }
  }

  const deduped = dedupeAcrossFiles(allRecipes)
  const reviewPath = path.join(outDir, 'recipes-ready-for-review.json')
  fs.writeFileSync(reviewPath, JSON.stringify(deduped, null, 2))

  console.log(`\n\nDone.`)
  console.log(`  ${allRecipes.length} recipe(s) found across all files`)
  console.log(`  ${deduped.length} after deduplication`)
  if (failed.length) {
    console.log(`  ${failed.length} file(s) failed and were skipped — re-run the same command to retry just these:`)
    failed.forEach((f) => console.log(`    - ${f}`))
  }
  console.log(`  -> ${reviewPath}`)
  console.log(`  -> images in ${IMAGES_DIR}`)
  console.log(`  -> lifestyle/routine/guideline text in ${LIFESTYLE_DIR} (upload these .txt files via the app's Knowledge Base page when ready)`)
}

main().catch((e) => { console.error(e); process.exit(1) })
