import { useEffect, useState, FormEvent } from 'react'
import { supabase } from './lib/supabase'
const NAMES: Record<string, string> = { identity: 'Identity', rtw: 'Right to work', dbs: 'DBS', dbs_update: 'DBS Update Service', references: 'References', employment_history: 'Employment history and gaps', qualifications: 'Qualifications', contract_jd: 'Contract and job description', appointment_docs: 'Appointment documents', induction: 'Induction' }
const HINT: Record<string, string> = {
  rtw: 'Home Office online share-code check, an eligible manual check or the Employer Checking Service. Uploading a document is not a check.',
  dbs: 'Eligibility and level depend on the role. Record whether the original certificate was seen and any barred-list information.',
  dbs_update: 'Needs consent and a certificate match. How often to re-check is organisational policy. A changed status needs human review.' }
type Chk = { id: string; check_type: string; status: string; method: string | null; outcome: string | null; checked_on: string | null; evidence_ref: string | null; follow_up_date: string | null; due_date: string | null; notes: string | null; consent_given: boolean | null; certificate_match: boolean | null; original_seen: boolean | null }
type Case = { id: string; status: string; employees: { first_name: string; last_name: string } | null }
type Rev = { id: string; decision: string; rationale: string; concerns: string | null; decided_on: string }

function Row({ c, onSave }: { c: Chk; onSave: (patch: Partial<Chk>) => Promise<void> }) {
  const [d, setD] = useState<Chk>(c)
  const set = (k: keyof Chk, v: unknown) => setD({ ...d, [k]: v === '' ? null : v })
  return (<tr><td><strong>{NAMES[c.check_type]}</strong>{HINT[c.check_type] && <small style={{ display: 'block', color: 'var(--muted)' }}>{HINT[c.check_type]}</small>}</td>
    <td><select value={d.status} aria-label={`Status ${NAMES[c.check_type]}`} onChange={e => set('status', e.target.value)}>
      <option value="not_started">Not started</option><option value="in_progress">In progress</option><option value="evidence_received">Evidence received (not verified)</option><option value="verified">Verified</option><option value="not_applicable">Not applicable</option></select></td>
    <td><input value={d.method ?? ''} placeholder="Method" aria-label="Method" onChange={e => set('method', e.target.value)} />
      <input value={d.evidence_ref ?? ''} placeholder="Reference (last 4 only)" maxLength={8} aria-label="Evidence reference" onChange={e => set('evidence_ref', e.target.value)} />
      {['dbs', 'dbs_update', 'rtw', 'identity'].includes(c.check_type) && <label><input type="checkbox" checked={!!d.original_seen} onChange={e => set('original_seen', e.target.checked)} /> Original seen</label>}
      {c.check_type === 'dbs_update' && <><label><input type="checkbox" checked={!!d.consent_given} onChange={e => set('consent_given', e.target.checked)} /> Consent</label>
        <label><input type="checkbox" checked={!!d.certificate_match} onChange={e => set('certificate_match', e.target.checked)} /> Certificate match</label></>}</td>
    <td><select value={d.outcome ?? ''} aria-label="Outcome" onChange={e => set('outcome', e.target.value)}><option value="">Outcome…</option><option>satisfactory</option><option>concerns</option></select>
      <input type="date" value={d.checked_on ?? ''} aria-label="Checked on" onChange={e => set('checked_on', e.target.value)} />
      <input type="date" value={d.follow_up_date ?? ''} aria-label="Follow-up or expiry date" onChange={e => set('follow_up_date', e.target.value)} /></td>
    <td><input value={d.notes ?? ''} placeholder="Notes" aria-label="Notes" onChange={e => set('notes', e.target.value)} />
      <button onClick={() => onSave({ status: d.status, method: d.method, outcome: d.outcome, checked_on: d.checked_on, evidence_ref: d.evidence_ref, follow_up_date: d.follow_up_date, notes: d.notes, consent_given: d.consent_given, certificate_match: d.certificate_match, original_seen: d.original_seen })}>Save</button></td></tr>)
}

function CaseView({ id, back }: { id: string; back: () => void }) {
  const [checks, setChecks] = useState<Chk[]>([]); const [revs, setRevs] = useState<Rev[]>([]); const [err, setErr] = useState('')
  const load = async () => {
    setChecks(((await supabase.from('onboarding_checks').select('*').eq('case_id', id)).data as Chk[]) ?? [])
    setRevs(((await supabase.from('suitability_reviews').select('*').eq('case_id', id).order('decided_on', { ascending: false })).data as Rev[]) ?? [])
  }
  useEffect(() => { load() }, [id])
  async function save(cid: string, patch: Partial<Chk>) {
    const { data } = await supabase.auth.getUser()
    const full: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() }
    if (patch.status === 'verified') full.checked_by = data.user?.id
    const { error } = await supabase.from('onboarding_checks').update(full).eq('id', cid)
    setErr(error ? (error.message.includes('onboarding_checks_check') ? 'To mark Verified, add the method, outcome and checked-on date. Not applicable needs a reason in Notes.' : error.message) : ''); load()
  }
  async function decide(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget; const f = new FormData(form)
    const { error } = await supabase.from('suitability_reviews').insert({ case_id: id, decision: f.get('decision'), rationale: f.get('rationale'), concerns: f.get('concerns') || null })
    if (error) return setErr(error.message)
    await supabase.from('onboarding_cases').update({ status: 'suitability_decided' }).eq('id', id); form.reset(); setErr(''); load()
  }
  const open = checks.filter(c => !['verified', 'not_applicable'].includes(c.status))
  return (<><button onClick={back}>Back to cases</button>
    <h3>Safer recruitment checks</h3>{err && <p className="err" role="alert">{err}</p>}
    <table><thead><tr><th>Check</th><th>Status</th><th>Evidence</th><th>Result</th><th>Notes</th></tr></thead><tbody>
      {checks.map(c => <Row key={c.id + c.status + (c.checked_on ?? '')} c={c} onSave={p => save(c.id, p)} />)}</tbody></table>
    <h3>Suitability decision</h3>
    <p>This is a decision for an authorised person. Completed tasks never clear someone to start.{open.length > 0 && ` ${open.length} check(s) are not yet verified or marked not applicable.`}</p>
    <form onSubmit={decide}><select name="decision" required><option value="further_review">Further review needed</option><option value="approved">Approved</option><option value="not_approved">Not approved</option></select>
      <input name="rationale" placeholder="Rationale and evidence considered" required style={{ minWidth: 320 }} /><input name="concerns" placeholder="Concerns (if any)" />
      <button className="primary">Record decision</button></form>
    <table><thead><tr><th>Date</th><th>Decision</th><th>Rationale</th><th>Concerns</th></tr></thead><tbody>
      {revs.length === 0 && <tr><td colSpan={4}>No decision recorded yet.</td></tr>}
      {revs.map(r => <tr key={r.id}><td>{r.decided_on.slice(0, 10)}</td><td>{r.decision.replace(/_/g, ' ')}</td><td>{r.rationale}</td><td>{r.concerns}</td></tr>)}</tbody></table></>)
}

export default function Onboarding() {
  const [cases, setCases] = useState<Case[]>([]); const [without, setWithout] = useState<{ id: string; first_name: string; last_name: string }[]>([]); const [sel, setSel] = useState<string | null>(null); const [err, setErr] = useState('')
  const load = async () => {
    const c = ((await supabase.from('onboarding_cases').select('id,status,employees(first_name,last_name)').order('created_at', { ascending: false })).data as unknown as Case[]) ?? []
    setCases(c); const emps = (await supabase.from('employees').select('id,first_name,last_name').eq('status', 'onboarding')).data ?? []
    const { data: all } = await supabase.from('onboarding_cases').select('employee_id'); const have = new Set((all ?? []).map(a => a.employee_id))
    setWithout(emps.filter(e => !have.has(e.id)))
  }
  useEffect(() => { load() }, [])
  async function open(emp: string) { const { error } = await supabase.rpc('create_onboarding_case', { p_employee: emp }); setErr(error?.message ?? ''); load() }
  if (sel) return <><h2>Onboarding</h2><CaseView id={sel} back={() => { setSel(null); load() }} /></>
  return (<><h2>Onboarding</h2>{err && <p className="err" role="alert">{err}</p>}
    <table><thead><tr><th>Employee</th><th>Suitability</th><th></th></tr></thead><tbody>
      {cases.length === 0 && <tr><td colSpan={3}>No onboarding cases yet. Converting a candidate opens one.</td></tr>}
      {cases.map(c => <tr key={c.id}><td>{c.employees?.first_name} {c.employees?.last_name}</td><td>{c.status === 'suitability_decided' ? 'Decision recorded' : 'Awaiting decision'}</td><td><button onClick={() => setSel(c.id)}>Open</button></td></tr>)}</tbody></table>
    {without.length > 0 && <><h3>Employees without an onboarding case</h3>{without.map(e => <p key={e.id}>{e.first_name} {e.last_name} <button onClick={() => open(e.id)}>Start onboarding</button></p>)}</>}</>)
}
