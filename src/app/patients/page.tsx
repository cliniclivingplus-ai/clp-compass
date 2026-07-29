'use client'
import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { Plus, User, Search } from 'lucide-react'
import type { Patient } from '@/types'

export default function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    fetch('/api/patients').then((r) => r.json()).then((j) => { setPatients(Array.isArray(j) ? j : []); setLoading(false) })
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return patients
    return patients.filter((p) =>
      p.full_name.toLowerCase().includes(q) ||
      p.clinic_patient_id?.toLowerCase().includes(q)
    )
  }, [patients, query])

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827' }}>Patients</h1>
          <p style={{ color: '#6b7280', fontSize: 13, marginTop: 3 }}>{patients.length} registered</p>
        </div>
        <Link href="/patients/new" style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#538A22', color: '#fff', padding: '10px 20px', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>
          <Plus size={16} /> New Patient
        </Link>
      </div>

      {patients.length > 0 && (
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <Search size={15} color="#9ca3af" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or patient ID (e.g. CLP-0042)"
            style={{ width: '100%', padding: '10px 14px 10px 38px', borderRadius: 9, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' }} />
        </div>
      )}

      {loading ? (
        <div style={{ color: '#9ca3af', fontSize: 13, padding: '20px 0' }}>Loading…</div>
      ) : !patients.length ? (
        <div style={{ background: '#fff', borderRadius: 12, padding: '60px 24px', border: '1px solid #e5e7eb', textAlign: 'center', color: '#9ca3af' }}>
          <User size={36} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
          <p style={{ fontSize: 15, fontWeight: 500, color: '#374151' }}>No patients yet</p>
          <p style={{ fontSize: 13, marginTop: 4 }}>Add your first patient to get started</p>
          <Link href="/patients/new" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 16, background: '#538A22', color: '#fff', padding: '9px 20px', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 13 }}>
            <Plus size={14} /> Add Patient
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ color: '#9ca3af', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>No patients match &quot;{query}&quot;</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((p) => (
            <Link key={p.id} href={`/patients/${p.id}`} style={{ background: '#fff', borderRadius: 10, padding: '16px 20px', border: '1px solid #e5e7eb', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#F2F9EC', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <User size={18} color="#538A22" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 15, color: '#111827' }}>{p.full_name}</span>
                  {p.clinic_patient_id && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#538A22', background: '#F2F9EC', border: '1px solid #C8E9A8', borderRadius: 20, padding: '1px 8px' }}>
                      {p.clinic_patient_id}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
                  {p.primary_concern ?? 'No concern noted'}{p.assigned_nutritionist ? ` · ${p.assigned_nutritionist}` : ''}
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#9ca3af' }}>
                {new Date(p.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
