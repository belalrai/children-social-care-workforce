import { useEffect, useState, FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import Recruitment from './Recruitment'
import Candidates from './Candidates'
import Onboarding from './Onboarding'

const NAV = ['Dashboard','Recruitment','Candidates','Employees','Onboarding','Compliance',"Children's Homes",'Reports','Settings'] as const
type Page = typeof NAV[number]
type Home = { id: string; name: string; address_line_1: string | null; city: string | null; postcode: string | null; ofsted_urn: string | null; registered_manager_name: string | null; contact_phone: string | null; status: string; is_demo: boolean }
type Emp = { id: string; first_name: string; last_name: string; job_title: string | null; status: string; is_demo: boolean;
  employee_home_assignments: { homes: { name: string } | null }[] }

function Login() {
  const [err, setErr] = useState('')
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const { error } = await supabase.auth.signInWithPassword({ email: String(f.get('email')), password: String(f.get('password')) })
    if (error) setErr('Sign-in failed. Check your email and password.')
  }
  return (<div className="login"><h1>Workforce Management</h1>
    <form onSubmit={submit}><label>Email<input name="email" type="email" required autoComplete="username" /></label>
      <label>Password<input name="password" type="password" required autoComplete="current-password" /></label>
      <button className="primary">Sign in</button>{err && <p className="err" role="alert">{err}</p>}</form>
    <p>Accounts are created by an administrator. There is no public registration.</p></div>)
}

function Homes({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<Home[]>([]); const [err, setErr] = useState('')
  const load = async () => { const { data } = await supabase.from('homes').select('*').order('name'); setRows((data as Home[]) ?? []) }
  useEffect(() => { load() }, [])
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget; const f = new FormData(form)
    const { error } = await supabase.from('homes').insert({ name: f.get('name'), address_line_1: f.get('address') || null, city: f.get('city'),
      postcode: f.get('postcode'), ofsted_urn: f.get('urn'), registered_manager_name: f.get('manager'), contact_phone: f.get('phone') })
    if (error) return setErr(error.code === '23505' ? 'A home with this Ofsted URN already exists.' : error.message)
    form.reset(); setErr(''); load(); onChange()
  }
  return (<><h2>Children's Homes</h2>
    <form onSubmit={add}><input name="name" placeholder="Home name" required /><input name="address" placeholder="Address line 1" />
      <input name="city" placeholder="City" required /><input name="postcode" placeholder="Postcode" required />
      <input name="urn" placeholder="Ofsted URN" required /><input name="manager" placeholder="Registered manager" required />
      <input name="phone" placeholder="Contact phone" required /><button className="primary">Add home</button></form>{err && <p className="err" role="alert">{err}</p>}
    <table><thead><tr><th>Name</th><th>Address</th><th>URN</th><th>Manager</th><th>Data</th></tr></thead><tbody>
      {rows.length === 0 && <tr><td colSpan={5}>No homes yet. Add your first home above.</td></tr>}
      {rows.map(h => <tr key={h.id}><td>{h.name}</td><td>{[h.address_line_1, h.city, h.postcode].filter(Boolean).join(', ')}</td>
        <td>{h.ofsted_urn}</td><td>{h.registered_manager_name}</td><td>{h.is_demo ? 'Demo' : 'Live'}</td></tr>)}</tbody></table></>)
}

function Employees({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<Emp[]>([]); const [homes, setHomes] = useState<Home[]>([]); const [err, setErr] = useState('')
  const load = async () => {
    const e = await supabase.from('employees').select('*, employee_home_assignments(homes(name))').order('last_name')
    setRows((e.data as unknown as Emp[]) ?? [])
    const h = await supabase.from('homes').select('*').order('name'); setHomes((h.data as Home[]) ?? [])
  }
  useEffect(() => { load() }, [])
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget; const f = new FormData(form)
    const email = String(f.get('email') || '').trim() || null
    const { data, error } = await supabase.from('employees').insert({ first_name: f.get('first'), last_name: f.get('last'), email, job_title: f.get('title') || null }).select('id').single()
    if (error) return setErr(error.code === '23505' ? 'An employee with this email already exists.' : error.message)
    if (f.get('home')) await supabase.from('employee_home_assignments').insert({ employee_id: data.id, home_id: f.get('home') })
    form.reset(); setErr(''); load(); onChange()
  }
  return (<><h2>Employees</h2>
    <form onSubmit={add}><input name="first" placeholder="First name" required /><input name="last" placeholder="Last name" required />
      <input name="email" type="email" placeholder="Email" /><input name="title" placeholder="Job title" />
      <select name="home" aria-label="Home"><option value="">Assign to home…</option>{homes.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select>
      <button className="primary">Add employee</button></form>{err && <p className="err" role="alert">{err}</p>}
    <table><thead><tr><th>Name</th><th>Role</th><th>Homes</th><th>Status</th></tr></thead><tbody>
      {rows.length === 0 && <tr><td colSpan={4}>No employees yet. Use synthetic data until security review is complete.</td></tr>}
      {rows.map(r => <tr key={r.id}><td>{r.first_name} {r.last_name}</td><td>{r.job_title}</td>
        <td>{r.employee_home_assignments.map(a => a.homes?.name).filter(Boolean).join(', ')}</td><td>{r.status}</td></tr>)}</tbody></table></>)
}

function Dashboard({ tick }: { tick: number }) {
  const [c, setC] = useState({ homes: 0, employees: 0, vacancies: 0, candidates: 0 })
  useEffect(() => { (async () => {
    const n = async (t: string) => (await supabase.from(t).select('*', { count: 'exact', head: true })).count ?? 0
    setC({ homes: await n('homes'), employees: await n('employees'), vacancies: await n('vacancies'), candidates: await n('candidates') })
  })() }, [tick])
  return (<><h2>Dashboard</h2><div className="stats">
    {Object.entries(c).map(([k, v]) => <div className="stat" key={k}><b>{v}</b>{k}</div>)}</div></>)
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null); const [ready, setReady] = useState(false)
  const [admin, setAdmin] = useState<boolean | null>(null); const [page, setPage] = useState<Page>('Dashboard'); const [tick, setTick] = useState(0)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s)); return () => data.subscription.unsubscribe()
  }, [])
  useEffect(() => { setAdmin(null); if (session) supabase.rpc('is_admin').then(({ data }) => setAdmin(data === true)) }, [session])
  if (!ready) return null
  if (!session) return <Login />
  if (admin === null) return <main>Checking access…</main>
  if (!admin) return (<div className="login"><p>Your account does not have access to this system yet. Ask an administrator.</p>
    <button className="primary" onClick={() => supabase.auth.signOut()}>Sign out</button></div>)
  const bump = () => setTick(t => t + 1)
  return (<div className="shell"><nav aria-label="Main"><h1>Workforce Management</h1>
    {NAV.map(p => <button key={p} aria-current={p === page ? 'page' : undefined} onClick={() => setPage(p)}>{p}</button>)}
    <button onClick={() => supabase.auth.signOut()}>Sign out</button></nav>
    <main><div className="banner">Development: synthetic data only. Do not enter real staff, DBS, right-to-work or safeguarding information.</div>
      {page === 'Dashboard' && <Dashboard tick={tick} />}
      {page === "Children's Homes" && <Homes onChange={bump} />}
      {page === 'Employees' && <Employees onChange={bump} />}
      {page === 'Recruitment' && <Recruitment onChange={bump} />}
      {page === 'Candidates' && <Candidates onChange={bump} />}
      {page === 'Onboarding' && <Onboarding />}
      {!['Dashboard', "Children's Homes", 'Employees', 'Recruitment', 'Candidates', 'Onboarding'].includes(page) && <><h2>{page}</h2><p>Built in a later phase. Phases 1 to 3 cover sign-in, homes, employees, recruitment and onboarding.</p></>}
    </main></div>)
}
