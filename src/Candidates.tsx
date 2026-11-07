import { useEffect, useState, FormEvent } from 'react'
import { supabase } from './lib/supabase'
const STAGES = ['new_candidate', 'cv_screening', 'shortlisted', 'interview_scheduled', 'interview_completed', 'references_suitability_review', 'conditional_offer', 'rejected', 'withdrawn', 'on_hold']
const label = (s: string) => s.replace(/_/g, ' ')
type C = { id: string; first_name: string; last_name: string; stage: string; source: string | null; offer_made_on: string | null; offer_accepted_on: string | null; employee_id: string | null; vacancies: { title: string } | null }
type R = { id: string; referee_name: string; employer: string | null; received_on: string | null; verified_on: string | null; outcome: string; concerns: string | null }
const today = () => new Date().toISOString().slice(0, 10)

function Detail({ c, reload, fail }: { c: C; reload: () => void; fail: (m: string) => void }) {
  const [refs, setRefs] = useState<R[]>([])
  const load = async () => setRefs(((await supabase.from('candidate_references').select('*').eq('candidate_id', c.id).order('created_at')).data as R[]) ?? [])
  useEffect(() => { load() }, [c.id])
  const run = async (p: PromiseLike<{ error: { message: string } | null }>) => { const { error } = await p; if (error) fail(error.message); else fail(''); load(); reload() }
  async function addRef(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget; const f = new FormData(form)
    await run(supabase.from('candidate_references').insert({ candidate_id: c.id, referee_name: f.get('name'), employer: f.get('employer') || null, requested_on: today() })); form.reset()
  }
  async function verify(id: string) {
    const { data } = await supabase.auth.getUser()
    await run(supabase.from('candidate_references').update({ verified_on: today(), verified_by: data.user?.id }).eq('id', id))
  }
  return (<tr><td colSpan={5}><div className="stat">
    <strong>References</strong>
    {refs.length === 0 && <p>No references requested yet.</p>}
    {refs.map(r => <p key={r.id}>{r.referee_name}{r.employer && ` (${r.employer})`}: {r.received_on ? `received ${r.received_on}` : 'not received'}; {r.verified_on ? `contact verified ${r.verified_on}` : 'contact not verified'}.{' '}
      {!r.received_on && <button onClick={() => run(supabase.from('candidate_references').update({ received_on: today() }).eq('id', r.id))}>Mark received</button>}{' '}
      {!r.verified_on && <button onClick={() => verify(r.id)}>Mark contact verified</button>}{' '}
      <select value={r.outcome} aria-label="Reference outcome" onChange={e => run(supabase.from('candidate_references').update({ outcome: e.target.value }).eq('id', r.id))}><option>pending</option><option>satisfactory</option><option>concerns</option></select></p>)}
    <form onSubmit={addRef}><input name="name" placeholder="Referee name" required /><input name="employer" placeholder="Employer" /><button className="primary">Request reference</button></form>
    <strong>Conditional offer</strong>
    <p>An offer is conditional on safer recruitment checks and does not authorise a start. A person decides each step.</p>
    {c.employee_id ? <p>Converted to employee. Continue in Onboarding.</p> : <>
      {!c.offer_made_on && <button onClick={() => run(supabase.from('candidates').update({ stage: 'conditional_offer', offer_made_on: today() }).eq('id', c.id))}>Record conditional offer</button>}
      {c.offer_made_on && !c.offer_accepted_on && <button onClick={() => run(supabase.from('candidates').update({ offer_accepted_on: today() }).eq('id', c.id))}>Record acceptance</button>}
      {c.offer_accepted_on && <button className="primary" onClick={() => run(supabase.rpc('convert_candidate_to_employee', { p_candidate: c.id }))}>Convert to employee</button>}</>}
  </div></td></tr>)
}

export default function Candidates({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<C[]>([]); const [vacs, setVacs] = useState<{ id: string; title: string }[]>([]); const [open, setOpen] = useState<string | null>(null); const [err, setErr] = useState('')
  const load = async () => {
    setRows(((await supabase.from('candidates').select('id,first_name,last_name,stage,source,offer_made_on,offer_accepted_on,employee_id,vacancies(title)').order('created_at', { ascending: false })).data as unknown as C[]) ?? [])
    setVacs((await supabase.from('vacancies').select('id,title').order('title')).data ?? [])
  }
  useEffect(() => { load() }, [])
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget; const f = new FormData(form)
    const { error } = await supabase.from('candidates').insert({ first_name: f.get('first'), last_name: f.get('last'), email: f.get('email') || null, phone: f.get('phone') || null, source: f.get('source') || null, vacancy_id: f.get('vacancy') || null })
    if (error) return setErr(error.message); form.reset(); setErr(''); load(); onChange()
  }
  async function stage(id: string, s: string) { const { error } = await supabase.from('candidates').update({ stage: s }).eq('id', id); setErr(error?.message ?? ''); load() }
  return (<><h2>Candidates</h2>
    <form onSubmit={add}><input name="first" placeholder="First name" required /><input name="last" placeholder="Last name" required /><input name="email" type="email" placeholder="Email" />
      <input name="phone" placeholder="Phone" /><input name="source" placeholder="Source" /><select name="vacancy" aria-label="Vacancy"><option value="">Vacancy…</option>{vacs.map(v => <option key={v.id} value={v.id}>{v.title}</option>)}</select>
      <button className="primary">Add candidate</button></form>{err && <p className="err" role="alert">{err}</p>}
    <p>Stages are moved by a person. Nothing is rejected or cleared automatically.</p>
    <table><thead><tr><th>Name</th><th>Vacancy</th><th>Stage</th><th>Source</th><th></th></tr></thead><tbody>
      {rows.length === 0 && <tr><td colSpan={5}>No candidates yet. Add one above.</td></tr>}
      {rows.flatMap(c => [<tr key={c.id}><td>{c.first_name} {c.last_name}</td><td>{c.vacancies?.title}</td>
        <td>{c.stage === 'hired' ? 'hired' : <select value={c.stage} aria-label={`Stage for ${c.first_name} ${c.last_name}`} onChange={e => stage(c.id, e.target.value)}>{STAGES.map(s => <option key={s} value={s}>{label(s)}</option>)}</select>}</td>
        <td>{c.source}</td><td><button onClick={() => setOpen(open === c.id ? null : c.id)} aria-expanded={open === c.id}>Details</button></td></tr>,
        open === c.id && <Detail key={c.id + 'd'} c={c} reload={load} fail={setErr} />])}</tbody></table></>)
}
