#!/usr/bin/env node
// One-off: imports output/recipes-ready-for-review.json into the live
// recipe_bank table (+ uploads each recipe's real embedded photo to the
// 'recipe-images' storage bucket, same as the app's own upload flow) —
// same field shape as POST /api/recipe-bank, so imported rows behave
// identically to ones a coach added by hand. Run from the main app dir so
// @supabase/supabase-js resolves from its node_modules.
//
// Usage: node import-to-db.js [--out ./output] [--dry-run]

const fs = require('fs')
const path = require('path')
const { createClient } = require(path.join(__dirname, '..', '..', 'node_modules', '@supabase', 'supabase-js'))

const args = process.argv.slice(2)
let outDir = path.join(__dirname, 'output')
let dryRun = false
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') { outDir = path.resolve(args[++i]); continue }
  if (args[i] === '--dry-run') { dryRun = true; continue }
}

const env = fs.readFileSync(path.join(__dirname, '..', '..', '.env.local'), 'utf8')
function getEnv(name) {
  const m = env.match(new RegExp(`^${name}=(.+)$`, 'm'))
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null
}
const supabase = createClient(getEnv('NEXT_PUBLIC_SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'))

function normalizeName(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

async function uploadImage(imagePath) {
  if (!imagePath || !fs.existsSync(imagePath)) return { image_url: null, image_storage_path: null }
  const ext = path.extname(imagePath).slice(1) || 'png'
  const storagePath = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const buf = fs.readFileSync(imagePath)
  const { error } = await supabase.storage.from('recipe-images').upload(storagePath, buf, { contentType: `image/${ext}`, upsert: true })
  if (error) { console.log(`    image upload failed: ${error.message}`); return { image_url: null, image_storage_path: null } }
  const { data } = supabase.storage.from('recipe-images').getPublicUrl(storagePath)
  return { image_url: data.publicUrl, image_storage_path: storagePath }
}

;(async () => {
  const reviewPath = path.join(outDir, 'recipes-ready-for-review.json')
  const recipes = JSON.parse(fs.readFileSync(reviewPath, 'utf8'))
  console.log(`Loaded ${recipes.length} recipe(s) from ${reviewPath}`)

  const { data: existing, error: existingErr } = await supabase.from('recipe_bank').select('name')
  if (existingErr) { console.error('Could not read existing recipe_bank:', existingErr.message); process.exit(1) }
  const existingNames = new Set((existing || []).map((r) => normalizeName(r.name)))
  console.log(`${existingNames.size} recipe(s) already in the database (will be skipped by name)`)

  let inserted = 0, skipped = 0, failed = 0, imagesUploaded = 0
  const failures = []

  for (let i = 0; i < recipes.length; i++) {
    const r = recipes[i]
    const key = normalizeName(r.name)
    if (existingNames.has(key)) { skipped++; continue }

    process.stdout.write(`[${i + 1}/${recipes.length}] ${r.name}... `)
    if (dryRun) { console.log('(dry run, would insert)'); inserted++; existingNames.add(key); continue }

    const { image_url, image_storage_path } = await uploadImage(r._imagePath)
    if (image_url) imagesUploaded++

    const { error } = await supabase.from('recipe_bank').insert({
      name: r.name, meal_type: r.meal_type, protein_label: null,
      ingredients: r.ingredients, steps: r.steps, tags: Array.isArray(r.tags) ? r.tags : [],
      eat_time: null, prep_time: r.prep_time || null, cook_time: r.cook_time || null,
      difficulty: null, health_score: null, servings: r.servings || null,
      tools: [], notes: [], benefits: Array.isArray(r.benefits) ? r.benefits : [],
      image_url, image_storage_path,
    })
    if (error) {
      console.log(`FAILED: ${error.message}`)
      failed++
      failures.push({ name: r.name, error: error.message })
    } else {
      console.log('ok' + (image_url ? ' (+photo)' : ''))
      inserted++
      existingNames.add(key)
    }
  }

  console.log(`\nDone${dryRun ? ' (dry run, nothing written)' : ''}.`)
  console.log(`  ${inserted} inserted`)
  console.log(`  ${skipped} skipped (already in the database)`)
  console.log(`  ${failed} failed`)
  console.log(`  ${imagesUploaded} photo(s) uploaded`)
  if (failures.length) {
    console.log('Failures:')
    failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`))
  }
})()
