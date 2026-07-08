import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Region } from '../lib/types'
import DayPresetsAdmin from './DayPresetsAdmin'

/**
 * Admin panel — generic CRUD over the reference tables.
 * Only admins can write (enforced by RLS; UI is also gated in App).
 */

type Value = string | number | boolean | null

interface Col {
  key: string
  label: string
  type: 'text' | 'number' | 'date' | 'bool' | 'select'
  options?: { value: Value; label: string }[]
  width?: number
}

interface EntityDef {
  table: string
  label: string
  cols: Col[]
  orderBy: string
  canAdd?: boolean
  canDelete?: boolean
}

const TABS = ['Sites', 'Transfers', 'Destinations', 'Meals', 'Services', 'Pax tiers', 'Tour Days', 'Settings', 'Users'] as const
type Tab = (typeof TABS)[number]

export default function Admin() {
  const [tab, setTab] = useState<Tab>('Sites')
  const [regions, setRegions] = useState<Region[]>([])

  useEffect(() => {
    supabase.from('q_regions').select('*').order('sort').then(({ data }) => setRegions(data ?? []))
  }, [])

  const siteRegions = regions.filter((r) => r.kind === 'site').map((r) => ({ value: r.id as Value, label: r.name }))
  const tripRegions = regions.filter((r) => r.kind === 'trip').map((r) => ({ value: r.id as Value, label: r.name }))

  const defs: Record<Exclude<Tab, 'Tour Days'>, EntityDef> = {
    Sites: {
      table: 'q_sites', label: 'Sites', orderBy: 'sort', canAdd: true,
      cols: [
        { key: 'name', label: 'Name', type: 'text', width: 240 },
        { key: 'region_id', label: 'Region', type: 'select', options: siteRegions },
        { key: 'price', label: 'Price (LE)', type: 'number' },
        { key: 'new_price', label: 'New price (LE)', type: 'number' },
        { key: 'effective_date', label: 'New price from', type: 'date' },
        { key: 'popular', label: 'Popular', type: 'bool' },
        { key: 'active', label: 'Active', type: 'bool' },
      ],
    },
    Transfers: {
      table: 'q_transfers', label: 'Transfers', orderBy: 'sort', canAdd: true,
      cols: [
        { key: 'name', label: 'Name', type: 'text', width: 260 },
        { key: 'region_id', label: 'Group', type: 'select', options: tripRegions },
        { key: 'price_limo', label: 'Limo/Hiace', type: 'number' },
        { key: 'price_coaster', label: 'Coaster', type: 'number' },
        { key: 'price_bus', label: 'Bus', type: 'number' },
        { key: 'new_price_limo', label: 'New Limo', type: 'number' },
        { key: 'new_price_coaster', label: 'New Coaster', type: 'number' },
        { key: 'new_price_bus', label: 'New Bus', type: 'number' },
        { key: 'effective_date', label: 'New from', type: 'date' },
        { key: 'countable', label: '+/- counter', type: 'bool' },
        { key: 'active', label: 'Active', type: 'bool' },
      ],
    },
    Destinations: {
      table: 'q_accommodation_destinations', label: 'Accommodation destinations', orderBy: 'sort', canAdd: true,
      cols: [
        { key: 'name', label: 'Name', type: 'text', width: 240 },
        { key: 'sort', label: 'Sort', type: 'number' },
        { key: 'active', label: 'Active', type: 'bool' },
      ],
    },
    Meals: {
      table: 'q_meal_tiers', label: 'Meal tiers', orderBy: 'price_le', canAdd: true,
      cols: [
        { key: 'price_le', label: 'Price (LE)', type: 'number' },
        { key: 'active', label: 'Active', type: 'bool' },
      ],
    },
    Services: {
      table: 'q_service_rates', label: 'Service rates', orderBy: 'id', canAdd: true,
      cols: [
        { key: 'name', label: 'Name', type: 'text', width: 200 },
        { key: 'rate_le_per_day', label: 'LE / day', type: 'number' },
        { key: 'active', label: 'Active', type: 'bool' },
      ],
    },
    'Pax tiers': {
      table: 'q_pax_tiers', label: 'Vehicle by group size', orderBy: 'min_pax', canAdd: true, canDelete: true,
      cols: [
        { key: 'min_pax', label: 'From pax', type: 'number' },
        { key: 'max_pax', label: 'To pax', type: 'number' },
        {
          key: 'vehicle', label: 'Vehicle', type: 'select',
          options: [
            { value: 'limo', label: 'Limousine/Hiace' },
            { value: 'coaster', label: 'Coaster' },
            { value: 'bus', label: 'Bus' },
          ],
        },
      ],
    },
    Settings: {
      table: 'q_settings', label: 'Settings', orderBy: 'key',
      cols: [
        { key: 'key', label: 'Key', type: 'text', width: 240 },
        { key: 'value', label: 'Value', type: 'text' },
      ],
    },
    Users: {
      table: 'q_profiles', label: 'Users', orderBy: 'created_at',
      cols: [
        { key: 'email', label: 'Email', type: 'text', width: 240 },
        { key: 'full_name', label: 'Name', type: 'text', width: 200 },
        {
          key: 'role', label: 'Role', type: 'select',
          options: [
            { value: 'agent', label: 'Agent' },
            { value: 'admin', label: 'Admin' },
          ],
        },
      ],
    },
  }

  return (
    <div className="admin">
      <nav className="steps">
        {TABS.map((t) => (
          <button key={t} className={t === tab ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>
        ))}
      </nav>
      {tab === 'Tour Days'
        ? <DayPresetsAdmin />
        : <EntityTable key={tab} def={defs[tab as Exclude<Tab, 'Tour Days'>]} />}
    </div>
  )
}

function EntityTable({ def }: { def: EntityDef }) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState<Value>(null)
  const [filter, setFilter] = useState('')

  const pk = def.table === 'q_settings' ? 'key' : 'id'
  // Users: pk is uuid id; settings: key. Immutable pk cells:
  const pkEditable = false

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from(def.table).select('*').order(def.orderBy)
    if (error) setError(error.message)
    setRows(data ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [def.table])

  async function saveCell(row: any, col: Col, value: Value) {
    let v: Value = value
    if (col.type === 'number') v = value === '' || value === null ? null : Number(value)
    if (col.type === 'date') v = value === '' ? null : value
    setSavingId(row[pk])
    const { error } = await supabase.from(def.table).update({ [col.key]: v }).eq(pk, row[pk])
    if (error) { setError(error.message) } else {
      setError('')
      setRows((rs) => rs.map((r) => (r[pk] === row[pk] ? { ...r, [col.key]: v } : r)))
    }
    setSavingId(null)
  }

  async function addRow() {
    const blank: any = {}
    for (const c of def.cols) {
      if (c.key === 'active') blank[c.key] = true
      else if (c.type === 'number') blank[c.key] = 0
      else if (c.type === 'bool') blank[c.key] = false
      else if (c.type === 'select') blank[c.key] = c.options?.[0]?.value ?? null
      else if (c.type === 'date') blank[c.key] = null
      else blank[c.key] = 'New entry'
    }
    const { error } = await supabase.from(def.table).insert(blank)
    if (error) setError(error.message)
    else { setError(''); load() }
  }

  async function deleteRow(row: any) {
    if (!confirm('Delete this row?')) return
    const { error } = await supabase.from(def.table).delete().eq(pk, row[pk])
    if (error) setError(error.message)
    else { setError(''); load() }
  }

  if (loading) return <div className="card">Loading {def.label}…</div>

  const visible = filter
    ? rows.filter((r) => JSON.stringify(r).toLowerCase().includes(filter.toLowerCase()))
    : rows

  return (
    <div className="card admin-table">
      <div className="table-head">
        <h3>{def.label} <span className="muted small">({rows.length})</span></h3>
        <input placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        {def.canAdd && <button onClick={addRow}>+ Add</button>}
      </div>
      {error && <div className="error">{error}</div>}
      <div className="table-scroll">
        <table className="grid-table">
          <thead>
            <tr>
              {def.cols.map((c) => <th key={c.key}>{c.label}</th>)}
              {def.canDelete && <th />}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={String(row[pk])} className={savingId === row[pk] ? 'saving' : ''}>
                {def.cols.map((c) => (
                  <td key={c.key} style={c.width ? { minWidth: c.width } : undefined}>
                    <Cell row={row} col={c} readOnly={c.key === pk && !pkEditable} onSave={(v) => saveCell(row, c, v)} />
                  </td>
                ))}
                {def.canDelete && (
                  <td><button className="link" onClick={() => deleteRow(row)}>delete</button></td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Cell({ row, col, readOnly, onSave }: {
  row: any; col: Col; readOnly?: boolean; onSave: (v: Value) => void
}) {
  const initial = row[col.key]
  const [val, setVal] = useState<any>(initial ?? '')
  useEffect(() => { setVal(initial ?? '') }, [initial])

  if (readOnly) return <span>{String(initial ?? '')}</span>

  if (col.type === 'bool') {
    return <input type="checkbox" checked={!!initial} onChange={(e) => onSave(e.target.checked)} />
  }
  if (col.type === 'select') {
    return (
      <select value={String(initial ?? '')} onChange={(e) => {
        const opt = col.options?.find((o) => String(o.value) === e.target.value)
        onSave(opt ? opt.value : e.target.value)
      }}>
        {col.options?.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
      </select>
    )
  }
  const commit = () => { if (String(val) !== String(initial ?? '')) onSave(val) }
  return (
    <input
      type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
      step={col.type === 'number' ? 'any' : undefined}
      value={val ?? ''}
      onChange={(e) => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}
