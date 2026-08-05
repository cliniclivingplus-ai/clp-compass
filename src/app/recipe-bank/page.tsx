'use client'
import { useState, useEffect, useRef } from 'react'
import { Plus, Loader2, Trash2, ChefHat, UploadCloud, FileText, Download, Pencil, Check, X } from 'lucide-react'
import { RECIPE_IMPORT_TEMPLATE } from '@/lib/parseRecipeBank'
import { splitRecipeLines } from '@/lib/recipeText'

const C = {
  green: '#538A22', greenDeep: '#2F5214', greenSoft: '#F2F9EC', greenBorder: '#C8E9A8',
  ink: '#1A2417', muted: '#6b7280', faint: '#8A9284', line: '#ECEBE3', card: '#FFFFFF',
  danger: '#b4462f',
}

type Recipe = {
  id: string; name: string; meal_type: string; protein_label: string | null; ingredients: string; steps: string; tags: string[]
  eat_time: string | null; prep_time: string | null; cook_time: string | null; difficulty: string | null; health_score: string | null; servings: string | null
  tools: string[]; notes: string[]; benefits: string[]
  image_url: string | null; image_storage_path: string | null
}

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack', 'dessert'] as const

const inputStyle = {
  width: '100%', padding: '9px 12px', borderRadius: 8, border: `1px solid ${C.line}`,
  fontSize: 13.5, color: C.ink, fontFamily: 'inherit', boxSizing: 'border-box' as const,
}
const labelStyle = { fontSize: 11, fontWeight: 700, color: C.faint, textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 6, display: 'block' }

export default function RecipeBankPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [name, setName] = useState('')
  const [mealType, setMealType] = useState<typeof MEAL_TYPES[number]>('breakfast')
  const [proteinLabel, setProteinLabel] = useState('')
  const [ingredients, setIngredients] = useState('')
  const [steps, setSteps] = useState('')
  const [tags, setTags] = useState('')
  const [showFacts, setShowFacts] = useState(false)
  const [eatTime, setEatTime] = useState('')
  const [prepTime, setPrepTime] = useState('')
  const [cookTime, setCookTime] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [healthScore, setHealthScore] = useState('')
  const [tools, setTools] = useState('')
  const [notes, setNotes] = useState('')
  const [servings, setServings] = useState('')
  const [benefits, setBenefits] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [deletingId, setDeletingId] = useState('')
  const [editingId, setEditingId] = useState('')
  const [editDraft, setEditDraft] = useState<{
    name: string; meal_type: string; protein_label: string; ingredients: string; steps: string; tags: string
    eat_time: string; prep_time: string; cook_time: string; difficulty: string; health_score: string; tools: string; notes: string
    servings: string; benefits: string; image_url: string; image_storage_path: string
  } | null>(null)
  const [editImageFile, setEditImageFile] = useState<File | null>(null)
  const [editImagePreview, setEditImagePreview] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')
  const [showFormat, setShowFormat] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ inserted: number; parseErrors: { block: number; reason: string }[] } | null>(null)
  const [importError, setImportError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/recipe-bank')
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || 'Could not load recipes.')
        return j as Recipe[]
      })
      .then((j) => setRecipes(Array.isArray(j) ? j : []))
      .catch((err) => setLoadError(err.message || 'Could not load recipes.'))
      .finally(() => setLoading(false))
  }, [])

  async function uploadRecipeImage(file: File): Promise<{ image_url: string; image_storage_path: string }> {
    const form = new FormData()
    form.append('file', file)
    const r = await fetch('/api/recipe-bank/image', { method: 'POST', body: form })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || 'Image upload failed')
    return j
  }

  async function save() {
    if (!name.trim() || !ingredients.trim() || !steps.trim()) return
    setSaving(true); setSaveError('')
    try {
      let image_url = ''; let image_storage_path = ''
      if (imageFile) {
        const uploaded = await uploadRecipeImage(imageFile)
        image_url = uploaded.image_url; image_storage_path = uploaded.image_storage_path
      }
      const r = await fetch('/api/recipe-bank', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(), meal_type: mealType, protein_label: proteinLabel.trim(), ingredients: ingredients.trim(), steps: steps.trim(), tags: tags.trim(),
          eat_time: eatTime.trim(), prep_time: prepTime.trim(), cook_time: cookTime.trim(), difficulty: difficulty.trim(), health_score: healthScore.trim(),
          tools: tools.trim(), notes: notes.trim(), servings: servings.trim(), benefits: benefits.trim(),
          image_url, image_storage_path,
        }),
      })
      const j = await r.json()
      if (!r.ok) { setSaveError(j.error || 'Save failed'); return }
      setRecipes((prev) => [j, ...prev])
      setName(''); setProteinLabel(''); setIngredients(''); setSteps(''); setTags('')
      setEatTime(''); setPrepTime(''); setCookTime(''); setDifficulty(''); setHealthScore(''); setTools(''); setNotes('')
      setServings(''); setBenefits(''); setImageFile(null); setImagePreview('')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Network error — try again.')
    } finally { setSaving(false) }
  }

  async function importFile(file: File) {
    setImporting(true); setImportError(''); setImportResult(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const r = await fetch('/api/recipe-bank/import', { method: 'POST', body: form })
      const j = await r.json()
      if (!r.ok) { setImportError(j.error || 'Import failed'); if (j.parseErrors) setImportResult({ inserted: 0, parseErrors: j.parseErrors }); return }
      setRecipes((prev) => [...(j.inserted ?? []), ...prev])
      setImportResult({ inserted: (j.inserted ?? []).length, parseErrors: j.parseErrors ?? [] })
    } catch {
      setImportError('Network error — try again.')
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function downloadTemplate() {
    const blob = new Blob([RECIPE_IMPORT_TEMPLATE], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'recipe-bank-template.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function remove(id: string) {
    setDeletingId(id)
    try {
      const r = await fetch(`/api/recipe-bank/${id}`, { method: 'DELETE' })
      if (r.ok) setRecipes((prev) => prev.filter((rc) => rc.id !== id))
    } finally { setDeletingId('') }
  }

  function startEdit(r: Recipe) {
    setEditingId(r.id); setEditError(''); setEditImageFile(null); setEditImagePreview('')
    // Clean split/rejoin, one item per line — so a recipe with doubled
    // bullets or PDF line-wrap fragments (splitRecipeLines already merges
    // those for display) shows up ready to fix, not still fragmented.
    setEditDraft({
      name: r.name, meal_type: r.meal_type, protein_label: r.protein_label || '',
      ingredients: splitRecipeLines(r.ingredients).join('\n'),
      steps: splitRecipeLines(r.steps).join('\n'),
      tags: r.tags.join(', '),
      eat_time: r.eat_time || '', prep_time: r.prep_time || '', cook_time: r.cook_time || '',
      difficulty: r.difficulty || '', health_score: r.health_score || '',
      tools: (r.tools || []).join('\n'), notes: (r.notes || []).join('\n'),
      servings: r.servings || '', benefits: (r.benefits || []).join('\n'),
      image_url: r.image_url || '', image_storage_path: r.image_storage_path || '',
    })
  }

  async function saveEdit(id: string) {
    if (!editDraft) return
    setEditSaving(true); setEditError('')
    try {
      let draft = editDraft
      if (editImageFile) {
        const uploaded = await uploadRecipeImage(editImageFile)
        draft = { ...draft, image_url: uploaded.image_url, image_storage_path: uploaded.image_storage_path }
      }
      const r = await fetch(`/api/recipe-bank/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const j = await r.json()
      if (!r.ok) { setEditError(j.error || 'Save failed'); return }
      setRecipes((prev) => prev.map((rc) => (rc.id === id ? j : rc)))
      setEditingId(''); setEditDraft(null); setEditImageFile(null); setEditImagePreview('')
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Network error — try again.')
    } finally { setEditSaving(false) }
  }

  const canSave = name.trim() && ingredients.trim() && steps.trim()

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <style>{`@keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }`}</style>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 4 }}>Recipe bank</h1>
      <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 24 }}>
        Real recipes coaches add once — the patient dashboard shows matching ones as clickable cards under each meal, with the real ingredients and steps you enter here. Nothing here is AI-generated.
      </p>

      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: '16px 18px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
          <button onClick={() => fileRef.current?.click()} disabled={importing}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 8, border: `1px solid ${C.greenBorder}`, background: C.greenSoft, color: C.greenDeep, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            {importing ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <UploadCloud size={14} />} Upload .txt or .docx
          </button>
          <input ref={fileRef} type="file" accept=".txt,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f) }} />
          <button onClick={() => setShowFormat((v) => !v)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', color: C.ink, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <FileText size={13} /> {showFormat ? 'Hide format' : 'Show format'}
          </button>
          <button onClick={downloadTemplate}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', color: C.ink, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <Download size={13} /> Download template (.txt)
          </button>
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: showFormat ? 10 : 0 }}>
          Type or paste up to 100+ recipes into one file using the format below, then upload it here — each one becomes a separate recipe automatically.
        </div>
        {showFormat && (
          <pre style={{ background: '#FBFBF8', border: `1px solid ${C.line}`, borderRadius: 8, padding: '12px 14px', fontSize: 12, color: C.ink, lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowX: 'auto', margin: 0 }}>{RECIPE_IMPORT_TEMPLATE}</pre>
        )}
        {importError && <div style={{ fontSize: 12.5, color: C.danger, marginTop: 10 }}>{importError}</div>}
        {importResult && (
          <div style={{ marginTop: 10, fontSize: 12.5 }}>
            {importResult.inserted > 0 && <div style={{ color: C.greenDeep, fontWeight: 600 }}>Added {importResult.inserted} recipe{importResult.inserted === 1 ? '' : 's'}.</div>}
            {importResult.parseErrors.length > 0 && (
              <div style={{ color: C.danger, marginTop: 6 }}>
                {importResult.parseErrors.length} skipped:
                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {importResult.parseErrors.map((e, i) => <li key={i}>Block {e.block}: {e.reason}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: '16px 18px', marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <label style={labelStyle}>Name</label>
            <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Sprouts Moringa Cheela + Vegetable Korma" />
          </div>
          <div>
            <label style={labelStyle}>Meal</label>
            <select style={inputStyle} value={mealType} onChange={(e) => setMealType(e.target.value as typeof mealType)}>
              {MEAL_TYPES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Protein (optional)</label>
            <input style={inputStyle} value={proteinLabel} onChange={(e) => setProteinLabel(e.target.value)} placeholder="≈ 15g protein" />
          </div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Photo (optional)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {imagePreview && <img src={imagePreview} alt="" style={{ width: 52, height: 52, borderRadius: 8, objectFit: 'cover', border: `1px solid ${C.line}` }} />}
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', color: C.ink, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
              <UploadCloud size={13} /> {imagePreview ? 'Change photo' : 'Add photo'}
              <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) { setImageFile(f); setImagePreview(URL.createObjectURL(f)) } }} />
            </label>
            {imagePreview && (
              <button type="button" onClick={() => { setImageFile(null); setImagePreview('') }}
                style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer' }}>Remove</button>
            )}
          </div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Ingredients</label>
          <textarea style={{ ...inputStyle, resize: 'vertical' as const, lineHeight: 1.5 }} rows={3} value={ingredients} onChange={(e) => setIngredients(e.target.value)} placeholder="One per line — moong sprouts, moringa leaves, besan, ..." />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Steps</label>
          <textarea style={{ ...inputStyle, resize: 'vertical' as const, lineHeight: 1.5 }} rows={3} value={steps} onChange={(e) => setSteps(e.target.value)} placeholder="Numbered or one step per line" />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Tags (optional, comma-separated — used to match to a patient's plan)</label>
          <input style={inputStyle} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="gut-health, high-protein, quick" />
        </div>
        <button onClick={() => setShowFacts((v) => !v)} type="button"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: 0, marginBottom: showFacts ? 10 : 12, background: 'none', border: 'none', color: C.green, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
          {showFacts ? '− Hide' : '+ Add'} facts, tools & notes (optional — from a recipe card, if you have one)
        </button>
        {showFacts && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={labelStyle}>Eat time</label>
                <input style={inputStyle} value={eatTime} onChange={(e) => setEatTime(e.target.value)} placeholder="~7:30 AM" />
              </div>
              <div>
                <label style={labelStyle}>Prep time</label>
                <input style={inputStyle} value={prepTime} onChange={(e) => setPrepTime(e.target.value)} placeholder="5 mins" />
              </div>
              <div>
                <label style={labelStyle}>Cook time</label>
                <input style={inputStyle} value={cookTime} onChange={(e) => setCookTime(e.target.value)} placeholder="10 mins" />
              </div>
              <div>
                <label style={labelStyle}>Difficulty</label>
                <input style={inputStyle} value={difficulty} onChange={(e) => setDifficulty(e.target.value)} placeholder="Easy" />
              </div>
              <div>
                <label style={labelStyle}>Health score</label>
                <input style={inputStyle} value={healthScore} onChange={(e) => setHealthScore(e.target.value)} placeholder="9/10" />
              </div>
              <div>
                <label style={labelStyle}>Servings</label>
                <input style={inputStyle} value={servings} onChange={(e) => setServings(e.target.value)} placeholder="1 serving" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={labelStyle}>Tools (one per line)</label>
                <textarea style={{ ...inputStyle, resize: 'vertical' as const, lineHeight: 1.5 }} rows={2} value={tools} onChange={(e) => setTools(e.target.value)} placeholder="Blender&#10;Tawa" />
              </div>
              <div>
                <label style={labelStyle}>Notes (one per line)</label>
                <textarea style={{ ...inputStyle, resize: 'vertical' as const, lineHeight: 1.5 }} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Best eaten fresh." />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Why it works (one per line — e.g. &quot;Berries — improve cognitive function&quot;)</label>
              <textarea style={{ ...inputStyle, resize: 'vertical' as const, lineHeight: 1.5 }} rows={2} value={benefits} onChange={(e) => setBenefits(e.target.value)} placeholder="Berries — improve cognitive function" />
            </div>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={save} disabled={saving || !canSave}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, border: 'none', background: C.green, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: canSave ? 1 : 0.6 }}>
            {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />} Add recipe
          </button>
          {saveError && <span style={{ fontSize: 12.5, color: C.danger }}>{saveError}</span>}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.muted, fontSize: 13 }}>
          <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Loading recipes…
        </div>
      ) : loadError ? (
        <div style={{ color: C.danger, fontSize: 13 }}>{loadError}</div>
      ) : recipes.length === 0 ? (
        <div style={{ color: C.muted, fontSize: 13, padding: '12px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <ChefHat size={16} /> No recipes yet — add one above to get started.
        </div>
      ) : (
        MEAL_TYPES.map((mt) => {
          const list = recipes.filter((r) => r.meal_type === mt)
          if (!list.length) return null
          return (
            <div key={mt} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.greenDeep, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>{mt}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {list.map((r) => {
                  if (editingId === r.id && editDraft) {
                    return (
                      <div key={r.id} style={{ background: C.card, border: `1px solid ${C.green}`, borderRadius: 12, padding: '14px 16px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                          <input style={inputStyle} value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} placeholder="Name" />
                          <select style={inputStyle} value={editDraft.meal_type} onChange={(e) => setEditDraft({ ...editDraft, meal_type: e.target.value })}>
                            {MEAL_TYPES.map((m) => <option key={m} value={m}>{m}</option>)}
                          </select>
                          <input style={inputStyle} value={editDraft.protein_label} onChange={(e) => setEditDraft({ ...editDraft, protein_label: e.target.value })} placeholder="Protein (optional)" />
                        </div>
                        <div style={{ marginBottom: 10 }}>
                          <label style={labelStyle}>Ingredients (one per line)</label>
                          <textarea style={{ ...inputStyle, resize: 'vertical' as const, lineHeight: 1.5 }} rows={4} value={editDraft.ingredients} onChange={(e) => setEditDraft({ ...editDraft, ingredients: e.target.value })} />
                        </div>
                        <div style={{ marginBottom: 10 }}>
                          <label style={labelStyle}>Steps (one per line)</label>
                          <textarea style={{ ...inputStyle, resize: 'vertical' as const, lineHeight: 1.5 }} rows={4} value={editDraft.steps} onChange={(e) => setEditDraft({ ...editDraft, steps: e.target.value })} />
                        </div>
                        <div style={{ marginBottom: 10 }}>
                          <label style={labelStyle}>Tags (comma-separated)</label>
                          <input style={inputStyle} value={editDraft.tags} onChange={(e) => setEditDraft({ ...editDraft, tags: e.target.value })} />
                        </div>
                        <div style={{ marginBottom: 10 }}>
                          <label style={labelStyle}>Photo</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {(editImagePreview || editDraft.image_url) && (
                              <img src={editImagePreview || editDraft.image_url} alt="" style={{ width: 52, height: 52, borderRadius: 8, objectFit: 'cover', border: `1px solid ${C.line}` }} />
                            )}
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', color: C.ink, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                              <UploadCloud size={13} /> {editImagePreview || editDraft.image_url ? 'Change photo' : 'Add photo'}
                              <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }}
                                onChange={(e) => { const f = e.target.files?.[0]; if (f) { setEditImageFile(f); setEditImagePreview(URL.createObjectURL(f)) } }} />
                            </label>
                            {(editImagePreview || editDraft.image_url) && (
                              <button type="button" onClick={() => { setEditImageFile(null); setEditImagePreview(''); setEditDraft({ ...editDraft, image_url: '', image_storage_path: '' }) }}
                                style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer' }}>Remove</button>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 10 }}>
                          <div>
                            <label style={labelStyle}>Eat time</label>
                            <input style={inputStyle} value={editDraft.eat_time} onChange={(e) => setEditDraft({ ...editDraft, eat_time: e.target.value })} />
                          </div>
                          <div>
                            <label style={labelStyle}>Prep time</label>
                            <input style={inputStyle} value={editDraft.prep_time} onChange={(e) => setEditDraft({ ...editDraft, prep_time: e.target.value })} />
                          </div>
                          <div>
                            <label style={labelStyle}>Cook time</label>
                            <input style={inputStyle} value={editDraft.cook_time} onChange={(e) => setEditDraft({ ...editDraft, cook_time: e.target.value })} />
                          </div>
                          <div>
                            <label style={labelStyle}>Difficulty</label>
                            <input style={inputStyle} value={editDraft.difficulty} onChange={(e) => setEditDraft({ ...editDraft, difficulty: e.target.value })} />
                          </div>
                          <div>
                            <label style={labelStyle}>Health score</label>
                            <input style={inputStyle} value={editDraft.health_score} onChange={(e) => setEditDraft({ ...editDraft, health_score: e.target.value })} />
                          </div>
                          <div>
                            <label style={labelStyle}>Servings</label>
                            <input style={inputStyle} value={editDraft.servings} onChange={(e) => setEditDraft({ ...editDraft, servings: e.target.value })} />
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                          <div>
                            <label style={labelStyle}>Tools (one per line)</label>
                            <textarea style={{ ...inputStyle, resize: 'vertical' as const, lineHeight: 1.5 }} rows={2} value={editDraft.tools} onChange={(e) => setEditDraft({ ...editDraft, tools: e.target.value })} />
                          </div>
                          <div>
                            <label style={labelStyle}>Notes (one per line)</label>
                            <textarea style={{ ...inputStyle, resize: 'vertical' as const, lineHeight: 1.5 }} rows={2} value={editDraft.notes} onChange={(e) => setEditDraft({ ...editDraft, notes: e.target.value })} />
                          </div>
                        </div>
                        <div style={{ marginBottom: 10 }}>
                          <label style={labelStyle}>Why it works (one per line)</label>
                          <textarea style={{ ...inputStyle, resize: 'vertical' as const, lineHeight: 1.5 }} rows={2} value={editDraft.benefits} onChange={(e) => setEditDraft({ ...editDraft, benefits: e.target.value })} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <button onClick={() => saveEdit(r.id)} disabled={editSaving}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: 'none', background: C.green, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                            {editSaving ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={12} />} Save
                          </button>
                          <button onClick={() => { setEditingId(''); setEditDraft(null); setEditError('') }}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', color: C.muted, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                            <X size={12} /> Cancel
                          </button>
                          {editError && <span style={{ fontSize: 12, color: C.danger }}>{editError}</span>}
                        </div>
                      </div>
                    )
                  }
                  return (
                    <div key={r.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: '14px 16px', display: 'flex', gap: 12 }}>
                      {r.image_url && <img src={r.image_url} alt="" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{r.name}{r.protein_label ? <span style={{ fontSize: 11.5, fontWeight: 600, color: C.green, marginLeft: 8 }}>{r.protein_label}</span> : null}</div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button onClick={() => startEdit(r)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, border: `1px solid ${C.line}`, background: '#fff', color: C.ink, fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>
                            <Pencil size={11} /> Edit
                          </button>
                          <button onClick={() => remove(r.id)} disabled={deletingId === r.id}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, border: `1px solid ${C.line}`, background: '#fff', color: C.danger, fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>
                            {deletingId === r.id ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={11} />} Delete
                          </button>
                        </div>
                      </div>
                      <ul style={{ fontSize: 12.5, color: C.muted, margin: '0 0 6px', paddingLeft: 18, listStyleType: 'disc' }}>
                        {splitRecipeLines(r.ingredients).map((line, i) => <li key={i}>{line}</li>)}
                      </ul>
                      <ol style={{ fontSize: 12.5, color: C.ink, margin: 0, paddingLeft: 18, listStyleType: 'decimal' }}>
                        {splitRecipeLines(r.steps).map((line, i) => <li key={i}>{line}</li>)}
                      </ol>
                      {r.tags.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                          {r.tags.map((t) => <span key={t} style={{ fontSize: 10.5, fontWeight: 600, color: C.greenDeep, background: C.greenSoft, border: `1px solid ${C.greenBorder}`, borderRadius: 10, padding: '2px 8px' }}>{t}</span>)}
                        </div>
                      )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
