'use client'
import { useState, useEffect, useRef } from 'react'
import { Plus, Loader2, Trash2, ImageIcon, X, UploadCloud } from 'lucide-react'

const C = {
  green: '#538A22', greenDeep: '#2F5214', greenSoft: '#F2F9EC', greenBorder: '#C8E9A8',
  ink: '#1A2417', muted: '#6b7280', faint: '#8A9284', line: '#ECEBE3', card: '#FFFFFF',
  danger: '#b4462f', dangerSoft: '#FBEBE6',
}

type GuideImage = { id: string; label: string; tags: string[]; image_url: string }

// One picked-but-not-yet-uploaded file, with its own label/tags and its own
// upload status — lets a whole batch be queued up, then each one uploaded
// and cleared out of the queue independently as it succeeds.
type PendingImage = {
  key: string
  file: File
  previewUrl: string
  label: string
  tags: string
  status: 'idle' | 'uploading' | 'error'
  error: string
}

const inputStyle = {
  width: '100%', padding: '9px 12px', borderRadius: 8, border: `1px solid ${C.line}`,
  fontSize: 13.5, color: C.ink, fontFamily: 'inherit', boxSizing: 'border-box' as const,
}

function labelFromFilename(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim()
}

export default function GuideImagesPage() {
  const [images, setImages] = useState<GuideImage[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [pending, setPending] = useState<PendingImage[]>([])
  const [uploadingAll, setUploadingAll] = useState(false)
  const [deletingId, setDeletingId] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/guide-images')
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || 'Could not load images.')
        return j as GuideImage[]
      })
      .then((j) => setImages(Array.isArray(j) ? j : []))
      .catch((err) => setLoadError(err.message || 'Could not load images.'))
      .finally(() => setLoading(false))
  }, [])

  // Revoke object URLs for anything still pending when the page unmounts,
  // so picking a large batch doesn't leak memory.
  useEffect(() => () => { pending.forEach((p) => URL.revokeObjectURL(p.previewUrl)) }, [pending])

  function addFiles(files: FileList | null) {
    if (!files?.length) return
    const additions: PendingImage[] = Array.from(files).map((file) => ({
      key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      label: labelFromFilename(file.name),
      tags: '',
      status: 'idle',
      error: '',
    }))
    setPending((prev) => [...prev, ...additions])
    if (fileRef.current) fileRef.current.value = ''
  }

  function updatePending(key: string, patch: Partial<PendingImage>) {
    setPending((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)))
  }

  function removePending(key: string) {
    setPending((prev) => {
      const target = prev.find((p) => p.key === key)
      if (target) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((p) => p.key !== key)
    })
  }

  async function uploadOne(item: PendingImage): Promise<boolean> {
    updatePending(item.key, { status: 'uploading', error: '' })
    try {
      const form = new FormData()
      form.append('file', item.file)
      form.append('label', item.label.trim())
      form.append('tags', item.tags.trim())
      const r = await fetch('/api/guide-images', { method: 'POST', body: form })
      const j = await r.json()
      if (!r.ok) { updatePending(item.key, { status: 'error', error: j.error || 'Upload failed' }); return false }
      setImages((prev) => [j, ...prev])
      URL.revokeObjectURL(item.previewUrl)
      setPending((prev) => prev.filter((p) => p.key !== item.key))
      return true
    } catch {
      updatePending(item.key, { status: 'error', error: 'Network error — try again.' })
      return false
    }
  }

  async function uploadAll() {
    const ready = pending.filter((p) => p.label.trim() && p.tags.trim())
    if (!ready.length) return
    setUploadingAll(true)
    for (const item of ready) await uploadOne(item)
    setUploadingAll(false)
  }

  async function remove(id: string) {
    setDeletingId(id)
    try {
      const r = await fetch(`/api/guide-images/${id}`, { method: 'DELETE' })
      if (r.ok) setImages((prev) => prev.filter((img) => img.id !== id))
    } finally { setDeletingId('') }
  }

  const readyCount = pending.filter((p) => p.label.trim() && p.tags.trim()).length

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <style>{`@keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }`}</style>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 4 }}>Picture bank</h1>
      <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 24 }}>
        Upload real photos once, tag them by topic (e.g. &quot;sleep&quot;, &quot;walking&quot;, &quot;breakfast&quot;, &quot;gut-health&quot;) — the PDF guide automatically matches an image to a section only when a tag genuinely fits. No match, no forced filler.
      </p>

      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: '16px 18px', marginBottom: 24 }}>
        <button onClick={() => fileRef.current?.click()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 8, border: `1px solid ${C.greenBorder}`, background: C.greenSoft, color: C.greenDeep, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          <UploadCloud size={15} /> Choose pictures
        </button>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple
          onChange={(e) => addFiles(e.target.files)} style={{ display: 'none' }} />
        <span style={{ fontSize: 12, color: C.muted, marginLeft: 10 }}>Select as many as you like at once — you&apos;ll label and tag each one below before it uploads.</span>

        {pending.length > 0 && (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pending.map((p) => (
              <div key={p.key} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px', border: `1px solid ${C.line}`, borderRadius: 10, background: '#FBFBF8' }}>
                <div style={{ width: 64, height: 64, borderRadius: 8, flexShrink: 0, background: `url(${p.previewUrl}) center/cover` }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input style={{ ...inputStyle, flex: '1 1 160px' }} value={p.label} onChange={(e) => updatePending(p.key, { label: e.target.value })} placeholder="Label, e.g. Morning walk" />
                    <input style={{ ...inputStyle, flex: '1 1 200px' }} value={p.tags} onChange={(e) => updatePending(p.key, { tags: e.target.value })} placeholder="Tags: walking, morning, cardio" />
                  </div>
                  {p.status === 'error' && <div style={{ fontSize: 11.5, color: C.danger }}>{p.error}</div>}
                  {(!p.label.trim() || !p.tags.trim()) && p.status !== 'uploading' && (
                    <div style={{ fontSize: 11, color: C.faint }}>
                      Needs {[!p.label.trim() && 'a label', !p.tags.trim() && 'at least one tag'].filter(Boolean).join(' and ')} before it can upload.
                    </div>
                  )}
                </div>
                {p.status === 'uploading' ? (
                  <Loader2 size={16} color={C.muted} style={{ animation: 'spin 1s linear infinite', flexShrink: 0, marginTop: 8 }} />
                ) : (
                  <button onClick={() => removePending(p.key)}
                    style={{ padding: 6, borderRadius: 7, border: `1px solid ${C.line}`, background: '#fff', color: C.faint, cursor: 'pointer', flexShrink: 0 }}>
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
            <div>
              <button onClick={uploadAll} disabled={uploadingAll || readyCount === 0}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 8, border: 'none', background: C.green, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: readyCount === 0 ? 0.6 : 1 }}>
                {uploadingAll ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />}
                {uploadingAll ? 'Uploading…' : `Upload ${readyCount || ''} picture${readyCount === 1 ? '' : 's'}`.trim()}
              </button>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.muted, fontSize: 13 }}>
          <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Loading images…
        </div>
      ) : loadError ? (
        <div style={{ color: C.danger, fontSize: 13 }}>{loadError}</div>
      ) : images.length === 0 ? (
        <div style={{ color: C.muted, fontSize: 13, padding: '12px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <ImageIcon size={16} /> No images yet — upload one above to get started.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
          {images.map((img) => (
            <div key={img.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ width: '100%', height: 110, background: `url(${img.image_url}) center/cover` }} />
              <div style={{ padding: '10px 12px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 4 }}>{img.label}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                  {img.tags.map((t) => (
                    <span key={t} style={{ fontSize: 10.5, fontWeight: 600, color: C.greenDeep, background: C.greenSoft, border: `1px solid ${C.greenBorder}`, borderRadius: 10, padding: '2px 8px' }}>{t}</span>
                  ))}
                </div>
                <button onClick={() => remove(img.id)} disabled={deletingId === img.id}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, border: `1px solid ${C.line}`, background: '#fff', color: C.danger, fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>
                  {deletingId === img.id ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={11} />} Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
