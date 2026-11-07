import { useEffect, useState, FormEvent } from 'react'
import { supabase } from './lib/supabase'
type V = { id: string; title: string; employment_type: string | null; hours_per_week: number | null; positions: number; status: string; homes: { name: string } | null }
const STATUSES = ['draft', 'open', 'on_hold', 'filled', 'closed']

export default function Recruitment({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<V[]>([]); const [homes, setHomes] = useState<{ id: string; name: string }[]>([]); const [err, setErr] = useState('')
  const load = async () => {
    setRows(((await supabase.from('vacancies').select('id,title,employment_type,hours_per_week,positions,status,homes(name)').order('created_at', { ascending: false })).data as unknown as V[]) ?? [])
    setHomes((await supabase.from('homes').select('id,name').order('name')).data ?? [])
  }
  useEffect(() => { load() }, [])
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget; const f = new FormData(form)
    const { error } = await supabase.from('vacancies').insert({ home_id: f.get('home'), title: f.get('title'), description: f.get('description') || null,
      employment_type: f.get('type'), hours_per_week: f.get('hours') || null, salary_min: f.get('smin') || null, salary_max: f.get('smax') || null,
      positions: Number(f.get('positions') || 1), status: 'draft' })
    if (error) return setErr(error.message); form.reset(); setErr(''); load(); onChange()
  }
  async function setStatus(id: string, status: string) {
    const { error } = await supabase.from('vacancies').update({ status }).eq('id', id); if (error) setErr(error.message); load()
  }
  return (<><h2>Recruitment</h2>
    <form onSubmit={add}><select name="home" required aria-label="Home"><option value="">Home…</option>{homes.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select>
      <input name="title" placeholder="Role title" required /><select name="type" aria-label="Employment type"><option>Permanent</option><option>Fixed term</option><option>Bank</option><option>Zero hours</option></select>
      <input name="hours" type="number" step="0.5" placeholder="Hours/week" /><input name="smin" type="number" placeholder="Salary min" /><input name="smax" type="number" placeholder="Salary max" />
      <input name="positions" type="number" min="1" defaultValue={1} aria-label="Positions" /><input name="description" placeholder="Job description / requirements" />
      <button className="primary">Add vacancy</button></form>{err && <p className="err" role="alert">{err}</p>}
    <table><thead><tr><th>Role</th><th>Home</th><th>Type</th><th>Hours</th><th>Posts</th><th>Status</th></tr></thead><tbody>
      {rows.length === 0 && <tr><td colSpan={6}>No vacancies yet. Add one above.</td></tr>}
      {rows.map(v => <tr key={v.id}><td>{v.title}</td><td>{v.homes?.name}</td><td>{v.employment_type}</td><td>{v.hours_per_week}</td><td>{v.positions}</td>
        <td><select value={v.status} aria-label={`Status for ${v.title}`} onChange={e => setStatus(v.id, e.target.value)}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></td></tr>)}</tbody></table></>)
}
