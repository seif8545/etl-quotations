import { useEffect, useState } from 'react'
import { supabase, loadRefData } from '../lib/supabase'
import type { DayPreset, RefData } from '../lib/types'

/** Admin editor for tour-day presets (q_day_presets): sites, transfer, photo, guide. */
export default function DayPresetsAdmin() {
  const [ref, setRef] = useState<RefData | null>(null)
  const [rows, setRows] = useState<DayPreset[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const [res, r] = await Promise.all([
      supabase.from('q_day_presets').select('*').order('sort'),
      loadRefData(),
    ])
    if (res.error) setError(res.error.message)
    setRows((res.data as DayPreset[]) ?? [])
    setRef(r)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function addRow() {
    const { error } = await supabase.from('q_day_presets').insert({
      name: 'New tour day', description: '', area: '', photo: '',
      site_ids: [], transfer_counts: {}, include_guide: true,
      sort: (rows.length ? rows[rows.length - 1].sort : 0) + 1, active: true,
    })
    if (error) setError(error.message); else load()
  }
  async function del(id: number) {
    if (!confirm('Delete this preset?')) return
    const { error } = await supabase.from('q_day_presets').delete().eq('id', id)
    if (error) setError(error.message); else load()
  }
  async function save(p: DayPreset) {
    const { id, ...rest } = p
    const { error } = await supabase.from('q_day_presets').update(rest).eq('id', id)
    if (error) setError(error.message); else { setError(''); load() }
  }

  if (loading || !ref) return <div className="card">Loading tour days…</div>

  return (
    <div className="card admin-table">
      <div className="table-head">
        <h3>Tour days <span className="muted small">({rows.length})</span></h3>
        <button onClick={addRow}>+ Add</button>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="preset-editors">
        {rows.map((p) => (
          <PresetEditor key={p.id} preset={p} ref_={ref} onSave={save} onDelete={() => del(p.id)} />
        ))}
      </div>
    </div>
  )
}

function PresetEditor({ preset, ref_, onSave, onDelete }: {
  preset: DayPreset; ref_: RefData; onSave: (p: DayPreset) => void; onDelete: () => void
}) {
  const [p, setP] = useState<DayPreset>(preset)
  const [dirty, setDirty] = useState(false)
  useEffect(() => { setP(preset); setDirty(false) }, [preset])
  const up = (patch: Partial<DayPreset>) => { setP((prev) => ({ ...prev, ...patch })); setDirty(true) }
  const siteRegions = ref_.regions.filter((r) => r.kind === 'site')
  const tripRegions = ref_.regions.filter((r) => r.kind === 'trip')

  function toggleSite(id: number) {
    up({ site_ids: p.site_ids.includes(id) ? p.site_ids.filter((x) => x !== id) : [...p.site_ids, id] })
  }
  function setTransfer(id: number, qty: number) {
    const tc: Record<number, number> = { ...p.transfer_counts }
    if (qty <= 0) delete tc[id]; else tc[id] = qty
    up({ transfer_counts: tc })
  }

  return (
    <div className="preset-editor card">
      <div className="preset-head">
        <input className="preset-name" value={p.name} onChange={(e) => up({ name: e.target.value })} placeholder="Day name" />
        <label className="check"><input type="checkbox" checked={p.active} onChange={(e) => up({ active: e.target.checked })} />Active</label>
        <label className="check"><input type="checkbox" checked={p.include_guide} onChange={(e) => up({ include_guide: e.target.checked })} />Guide</label>
        <label>Sort <input type="number" style={{ width: 60 }} value={p.sort} onChange={(e) => up({ sort: +e.target.value })} /></label>
      </div>
      <textarea rows={2} placeholder="Description (shown on the client PDF)" value={p.description} onChange={(e) => up({ description: e.target.value })} />
      <div className="preset-photo-row">
        <label>Photo <input value={p.photo} onChange={(e) => up({ photo: e.target.value })} placeholder="cairo-giza/gem-pyramids.jpeg" /></label>
        {p.photo && <img src={`/images/tours/${p.photo}`} alt="" className="preset-thumb" />}
      </div>
      <details>
        <summary>Sites ({p.site_ids.length})</summary>
        <div className="pick-columns">
          {siteRegions.map((reg) => {
            const sites = ref_.sites.filter((s) => s.region_id === reg.id)
            if (!sites.length) return null
            return (
              <section key={reg.id}>
                <h4>{reg.name}</h4>
                {sites.map((s) => (
                  <label key={s.id} className="check">
                    <input type="checkbox" checked={p.site_ids.includes(s.id)} onChange={() => toggleSite(s.id)} />
                    <span>{s.name}</span>
                  </label>
                ))}
              </section>
            )
          })}
        </div>
      </details>
      <details>
        <summary>Transfers ({Object.keys(p.transfer_counts).length})</summary>
        <div className="pick-columns">
          {tripRegions.map((reg) => {
            const list = ref_.transfers.filter((t) => t.region_id === reg.id)
            if (!list.length) return null
            return (
              <section key={reg.id}>
                <h4>{reg.name}</h4>
                {list.map((t) => (
                  <label key={t.id} className="check">
                    <input type="number" min={0} style={{ width: 50 }} value={p.transfer_counts[t.id] ?? 0}
                      onChange={(e) => setTransfer(t.id, +e.target.value)} />
                    <span>{t.name}</span>
                  </label>
                ))}
              </section>
            )
          })}
        </div>
      </details>
      <div className="preset-actions">
        <button className="primary" disabled={!dirty} onClick={() => onSave(p)}>{dirty ? 'Save' : 'Saved'}</button>
        <button className="link danger" onClick={onDelete}>Delete</button>
      </div>
    </div>
  )
}
