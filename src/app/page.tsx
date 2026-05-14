'use client'
import { useState, useEffect, useCallback } from 'react'
import styles from './page.module.css'

// ─── TYPES ───────────────────────────────────────────────────────
type Task = { id: string; url: string; title: string; status: string; priority: string; category: string; due: string; notes: string }
type CalEvent = { id: string; summary: string; start: string; allDay: boolean; location?: string }
type Email = { id: string; subject: string; from: string; snippet: string; priority: number; tag: string }
type AsanaGroup = Record<string, { id: string; name: string; due: string; overdue: boolean; projectLink: string }[]>
type SkylightItem = { cat: string; text: string }

const TABS = ['Focus','Calendar','Email','Tasks','Skylight','Work','Brain Dump','Apps'] as const
type Tab = typeof TABS[number]

const TASK_FILTERS = ['active','today','week','all','done'] as const
type TaskFilter = typeof TASK_FILTERS[number]

// ─── HELPERS ─────────────────────────────────────────────────────
function fmtTime(iso: string) {
  if (!iso) return 'All day'
  return new Date(iso).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })
}
function fmtDate(s: string) {
  if (!s) return ''
  return new Date(s).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
}
function isOverdue(due: string) { return due && new Date(due) < new Date() }

// ─── TAGS ────────────────────────────────────────────────────────
function Tag({ label, color }: { label: string; color: 'red'|'warm'|'green'|'gray'|'dark' }) {
  const cls = { red:'tagRed', warm:'tagWarm', green:'tagGreen', gray:'tagGray', dark:'tagDark' }[color]
  return <span className={`${styles.tag} ${styles[cls]}`}>{label}</span>
}

function statusTag(s: string) {
  if (!s) return null
  const map: Record<string, 'red'|'warm'|'green'|'gray'> = { Today:'red', 'This Week':'warm', Inbox:'gray', Later:'gray', Waiting:'gray', Done:'green' }
  return <Tag label={s} color={map[s]||'gray'} />
}
function priorityTag(p: string) {
  if (!p) return null
  const map: Record<string, 'red'|'warm'|'gray'> = { Urgent:'red', High:'warm', Medium:'gray', Low:'gray' }
  return <Tag label={p} color={map[p]||'gray'} />
}

// ─── COMPONENTS ──────────────────────────────────────────────────
function Spinner() { return <div className={styles.spinner} /> }
function Loading({ text }: { text: string }) {
  return <div className={styles.loadingRow}><Spinner />{text}</div>
}
function Err({ msg }: { msg: string }) {
  return <div className={styles.errorRow}>⚠ {msg}</div>
}
function Empty({ text }: { text: string }) {
  return <div className={styles.empty}>{text}</div>
}

function Card({ title, link, linkText, children, onRefresh }: {
  title: string; link?: string; linkText?: string;
  children: React.ReactNode; onRefresh?: () => void
}) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.cardTitle}>{title}</span>
        <div className={styles.cardActions}>
          {onRefresh && <button className={`${styles.btn} ${styles.btnSm}`} onClick={onRefresh}>↻</button>}
          {link && <a className={styles.cardLink} href={link} target="_blank" rel="noreferrer">{linkText||'Open ↗'}</a>}
        </div>
      </div>
      {children}
    </div>
  )
}

// ─── TASK ROW ────────────────────────────────────────────────────
function TaskRow({ task, compact, onDone }: { task: Task; compact?: boolean; onDone: (id: string) => void }) {
  const done = task.status === 'Done'
  return (
    <div className={styles.taskRow}>
      <div
        className={`${styles.taskCheck} ${done ? styles.taskCheckDone : ''}`}
        onClick={() => !done && onDone(task.id)}
        title="Mark done"
      />
      <div className={styles.taskBody}>
        <div className={`${styles.taskName} ${done ? styles.taskDone : ''}`}>{task.title}</div>
        {!compact && (
          <div className={styles.taskMeta}>
            {task.category && <span>{task.category}</span>}
            {statusTag(task.status)}
            {priorityTag(task.priority)}
            {task.due && <Tag label={fmtDate(task.due)} color={isOverdue(task.due)?'red':'gray'} />}
          </div>
        )}
      </div>
      {task.url && <a className={`${styles.btn} ${styles.btnSm}`} href={task.url} target="_blank" rel="noreferrer">↗</a>}
    </div>
  )
}

// ─── MAIN APP ────────────────────────────────────────────────────
export default function Home() {
  const [tab, setTab] = useState<Tab>('Focus')
  const [date, setDate] = useState('')
  const [refreshedAt, setRefreshedAt] = useState('')

  // Data state
  const [tasks, setTasks] = useState<Task[]>([])
  const [tasksLoading, setTasksLoading] = useState(false)
  const [tasksError, setTasksError] = useState('')
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('active')

  const [events, setEvents] = useState<CalEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventsError, setEventsError] = useState('')

  const [emails, setEmails] = useState<Email[]>([])
  const [emailsLoading, setEmailsLoading] = useState(false)
  const [emailsError, setEmailsError] = useState('')

  const [asana, setAsana] = useState<AsanaGroup>({})
  const [asanaLoading, setAsanaLoading] = useState(false)
  const [asanaError, setAsanaError] = useState('')

  // Add task form
  const [addOpen, setAddOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newCat, setNewCat] = useState('Personal Admin')
  const [newStatus, setNewStatus] = useState('Inbox')
  const [newPriority, setNewPriority] = useState('Medium')
  const [newDue, setNewDue] = useState('')
  const [addMsg, setAddMsg] = useState('')
  const [adding, setAdding] = useState(false)

  // Brain dump
  const [dumpText, setDumpText] = useState('')

  // Skylight
  const [skylightItems, setSkylightItems] = useState<SkylightItem[]>(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('skylight_items') : null
      return saved ? JSON.parse(saved) : defaultSkylight()
    } catch { return defaultSkylight() }
  })
  const [newSkylightItem, setNewSkylightItem] = useState('')
  const [newSkylightCat, setNewSkylightCat] = useState('Errands')
  const [copied, setCopied] = useState(false)

  // Init
  useEffect(() => {
    const now = new Date()
    setDate(now.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' }))
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
    // Load initial data
    loadTasks('active')
    loadEvents()
  }, [])

  // ─── DATA FETCHERS ─────────────────────────────────────────────
  const loadTasks = useCallback(async (filter: TaskFilter = 'active') => {
    setTasksLoading(true); setTasksError('')
    try {
      const res = await fetch(`/api/notion/tasks?filter=${filter}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setTasks(data.tasks || [])
    } catch (e: any) { setTasksError(e.message) }
    finally { setTasksLoading(false) }
  }, [])

  const loadEvents = useCallback(async () => {
    setEventsLoading(true); setEventsError('')
    try {
      const res = await fetch('/api/calendar')
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setEvents(data.events || [])
    } catch (e: any) { setEventsError(e.message) }
    finally { setEventsLoading(false) }
  }, [])

  const loadEmails = useCallback(async () => {
    setEmailsLoading(true); setEmailsError('')
    try {
      const res = await fetch('/api/gmail')
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setEmails(data.emails || [])
    } catch (e: any) { setEmailsError(e.message) }
    finally { setEmailsLoading(false) }
  }, [])

  const loadAsana = useCallback(async () => {
    setAsanaLoading(true); setAsanaError('')
    try {
      const res = await fetch('/api/asana')
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setAsana(data.grouped || {})
    } catch (e: any) { setAsanaError(e.message) }
    finally { setAsanaLoading(false) }
  }, [])

  const refreshAll = () => {
    loadTasks(taskFilter); loadEvents(); loadEmails(); loadAsana()
    setRefreshedAt(new Date().toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' }))
  }

  // Load on tab switch
  useEffect(() => {
    if (tab === 'Email' && !emails.length) loadEmails()
    if (tab === 'Work' && !Object.keys(asana).length) loadAsana()
    if (tab === 'Calendar' && !events.length) loadEvents()
  }, [tab])

  // ─── TASK ACTIONS ──────────────────────────────────────────────
  const markDone = async (id: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'Done' } : t))
    try {
      await fetch('/api/notion/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'Done' }),
      })
    } catch (e: any) {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'Inbox' } : t))
    }
  }

  const addTask = async () => {
    if (!newTitle.trim()) return
    setAdding(true); setAddMsg('Adding…')
    try {
      const res = await fetch('/api/notion/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle, category: newCat, status: newStatus, priority: newPriority, due: newDue }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setAddMsg('✓ Added!')
      setNewTitle(''); setNewDue('')
      setTimeout(() => { setAddMsg(''); setAddOpen(false) }, 1500)
      loadTasks(taskFilter)
    } catch (e: any) { setAddMsg('Error: ' + e.message) }
    finally { setAdding(false) }
  }

  // ─── SKYLIGHT ──────────────────────────────────────────────────
  const addSkylight = () => {
    if (!newSkylightItem.trim()) return
    const updated = [...skylightItems, { cat: newSkylightCat, text: newSkylightItem.trim() }]
    setSkylightItems(updated)
    localStorage.setItem('skylight_items', JSON.stringify(updated))
    setNewSkylightItem('')
  }

  const copySkylight = () => {
    const grouped: Record<string, string[]> = {}
    skylightItems.forEach(i => { if (!grouped[i.cat]) grouped[i.cat] = []; grouped[i.cat].push(i.text) })
    const lines = ['📋 SKYLIGHT — TODAY\'S LIST', '']
    Object.entries(grouped).forEach(([cat, items]) => { lines.push(cat); items.forEach(i => lines.push('☐ ' + i)); lines.push('') })
    navigator.clipboard.writeText(lines.join('\n')).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  // ─── FILTERED TASKS ────────────────────────────────────────────
  const filteredTasks = tasks.filter(t => {
    if (taskFilter === 'today') return t.status === 'Today'
    if (taskFilter === 'week') return t.status === 'Today' || t.status === 'This Week'
    if (taskFilter === 'done') return t.status === 'Done'
    if (taskFilter === 'active') return t.status !== 'Done'
    return true
  })

  const urgentTasks = tasks.filter(t => t.status === 'Today' || t.priority === 'Urgent')
  const urgentEmailCount = emails.filter(e => e.priority === 1).length

  // ─── RENDER ────────────────────────────────────────────────────
  return (
    <div className={styles.app}>

      {/* HEADER */}
      <header className={styles.header}>
        <div>
          <div className={styles.headerTitle}>Alex — Command Hub</div>
          <div className={styles.headerDate}>{date}</div>
        </div>
        <button className={styles.refreshAllBtn} onClick={refreshAll}>↻ Refresh</button>
      </header>

      {/* TABS */}
      <nav className={styles.tabs}>
        {TABS.map(t => (
          <button
            key={t}
            className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
            onClick={() => setTab(t)}
          >
            {t}
            {t === 'Email' && urgentEmailCount > 0 && <span className={styles.tabBadge}>{urgentEmailCount}</span>}
          </button>
        ))}
      </nav>

      {/* CONTENT */}
      <main className={`${styles.main} scroll-area`}>

        {/* ── FOCUS ── */}
        {tab === 'Focus' && (
          <div>
            <Card title="Today's Priorities" onRefresh={() => { loadTasks('active'); loadEvents() }}>
              {tasksLoading ? <Loading text="Loading…" /> : urgentTasks.length === 0
                ? <Empty text="No urgent tasks today." />
                : urgentTasks.slice(0,3).map((t,i) => (
                  <div key={t.id} className={styles.priorityItem}>
                    <div className={`${styles.priorityNum} ${i===0?styles.urgent:''}`}>{i+1}</div>
                    <div>
                      <div className={styles.priorityTitle}>{t.title}</div>
                      <div className={styles.prioritySub}>{t.category} · {t.status}</div>
                    </div>
                  </div>
                ))
              }
            </Card>
            <div className={styles.grid2}>
              <Card title="Calendar" link="https://calendar.google.com" onRefresh={loadEvents}>
                {eventsLoading ? <Loading text="Loading…" /> :
                  eventsError ? <Err msg={eventsError} /> :
                  events.length === 0 ? <Empty text="No events today." /> :
                  events.slice(0,4).map(e => (
                    <div key={e.id} className={styles.row}>
                      <div className={styles.rowTime}>{e.allDay ? 'All day' : fmtTime(e.start)}</div>
                      <div className={styles.rowMain}>
                        <div className={styles.rowTitle}>{e.summary}</div>
                        {e.location && <div className={styles.rowSub}>{e.location}</div>}
                      </div>
                    </div>
                  ))
                }
              </Card>
              <Card title="Urgent Tasks" link="https://www.notion.so/4613db7559444b929881f6615b67b27c" linkText="Notion ↗">
                {tasksLoading ? <Loading text="Loading…" /> :
                  tasksError ? <Err msg={tasksError} /> :
                  urgentTasks.length === 0 ? <Empty text="No urgent tasks." /> :
                  urgentTasks.slice(0,4).map(t => <TaskRow key={t.id} task={t} compact onDone={markDone} />)
                }
              </Card>
            </div>
          </div>
        )}

        {/* ── CALENDAR ── */}
        {tab === 'Calendar' && (
          <Card title="Today's Calendar" link="https://calendar.google.com" onRefresh={loadEvents}>
            {eventsLoading ? <Loading text="Loading events…" /> :
              eventsError ? <Err msg={eventsError} /> :
              events.length === 0 ? <Empty text="No events today." /> :
              events.map(e => (
                <div key={e.id} className={styles.row}>
                  <div className={styles.rowTime}>{e.allDay ? 'All day' : fmtTime(e.start)}</div>
                  <div className={styles.rowMain}>
                    <div className={styles.rowTitle}>{e.summary}</div>
                    {e.location && <div className={styles.rowSub}>{e.location}</div>}
                  </div>
                </div>
              ))
            }
          </Card>
        )}

        {/* ── EMAIL ── */}
        {tab === 'Email' && (
          <Card title="Important Emails" link="https://mail.google.com" onRefresh={loadEmails}>
            {emailsLoading ? <Loading text="Loading emails…" /> :
              emailsError ? <Err msg={emailsError} /> :
              emails.length === 0 ? <Empty text="No unread emails in the last 2 days." /> :
              emails.map(e => {
                const tagColor: 'red'|'warm'|'gray' = e.priority === 1 ? 'red' : e.priority === 2 ? 'warm' : 'gray'
                return (
                  <div key={e.id} className={styles.emailItem}>
                    <div className={styles.emailFrom}>{e.from}</div>
                    <div className={styles.emailSubject}>{e.subject} <Tag label={e.tag} color={tagColor} /></div>
                    <div className={styles.emailSnippet}>{e.snippet}</div>
                    <div className={styles.rowActions}>
                      <a className={`${styles.btn} ${styles.btnSm}`} href="https://mail.google.com" target="_blank" rel="noreferrer">View</a>
                    </div>
                  </div>
                )
              })
            }
          </Card>
        )}

        {/* ── TASKS ── */}
        {tab === 'Tasks' && (
          <Card title="Personal Tasks" link="https://www.notion.so/4613db7559444b929881f6615b67b27c" linkText="Notion ↗" onRefresh={() => loadTasks(taskFilter)}>
            {/* Filter bar */}
            <div className={styles.filterBar}>
              {TASK_FILTERS.map(f => (
                <button key={f} className={`${styles.btn} ${styles.btnSm} ${taskFilter===f?styles.btnActive:''}`}
                  onClick={() => { setTaskFilter(f); loadTasks(f) }}>
                  {f.charAt(0).toUpperCase()+f.slice(1)}
                </button>
              ))}
            </div>
            {tasksLoading ? <Loading text="Loading tasks…" /> :
              tasksError ? <Err msg={tasksError} /> :
              filteredTasks.length === 0 ? <Empty text="No tasks for this filter." /> :
              filteredTasks.map(t => <TaskRow key={t.id} task={t} onDone={markDone} />)
            }
            {/* Add task */}
            <button className={styles.toggleAddBtn} onClick={() => setAddOpen(o => !o)}>
              {addOpen ? '− Cancel' : '+ Add task to Notion'}
            </button>
            {addOpen && (
              <div className={styles.addForm}>
                <input className={styles.formInput} value={newTitle} onChange={e=>setNewTitle(e.target.value)}
                  placeholder="Task name…" onKeyDown={e=>e.key==='Enter'&&addTask()} autoFocus />
                <div className={styles.formRow}>
                  <select className={styles.formSelect} value={newCat} onChange={e=>setNewCat(e.target.value)}>
                    {['Personal Admin','Finance / CRA / Taxes','Legal / Court / Insurance','Health / Appointments','Errands','Pets','Family Admin','Follow-Up','Other'].map(c=><option key={c}>{c}</option>)}
                  </select>
                  <select className={styles.formSelect} value={newStatus} onChange={e=>setNewStatus(e.target.value)}>
                    {['Today','This Week','Inbox','Later','Waiting'].map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className={styles.formRow}>
                  <select className={styles.formSelect} value={newPriority} onChange={e=>setNewPriority(e.target.value)}>
                    {['Urgent','High','Medium','Low'].map(p=><option key={p}>{p}</option>)}
                  </select>
                  <input className={styles.formSelect} type="date" value={newDue} onChange={e=>setNewDue(e.target.value)} />
                </div>
                <div className={styles.formRow}>
                  <button className={`${styles.btn} ${styles.btnDark}`} onClick={addTask} disabled={adding}>
                    {adding ? 'Adding…' : 'Add to Notion'}
                  </button>
                  {addMsg && <span style={{fontSize:12,color:'var(--text-3)'}}>{addMsg}</span>}
                </div>
              </div>
            )}
          </Card>
        )}

        {/* ── SKYLIGHT ── */}
        {tab === 'Skylight' && (
          <Card title="Skylight Copy List">
            <button className={`${styles.btn} ${styles.btnDark}`} style={{marginBottom:14}} onClick={copySkylight}>
              {copied ? '✓ Copied!' : 'Copy Full List'}
            </button>
            {(() => {
              const grouped: Record<string, string[]> = {}
              skylightItems.forEach(i => { if (!grouped[i.cat]) grouped[i.cat] = []; grouped[i.cat].push(i.text) })
              return Object.entries(grouped).map(([cat, items]) => (
                <div key={cat} className={styles.skylightSection}>
                  <div className={styles.skylightLabel}>{cat}</div>
                  <ul className={styles.skylightList}>
                    {items.map((item, i) => <li key={i}>{item}</li>)}
                  </ul>
                </div>
              ))
            })()}
            <div className={styles.skylightAdd}>
              <div className={styles.cardTitle} style={{marginBottom:10}}>Add item</div>
              <div className={styles.formRow}>
                <input className={styles.formInput} value={newSkylightItem} onChange={e=>setNewSkylightItem(e.target.value)}
                  placeholder="Add item…" onKeyDown={e=>e.key==='Enter'&&addSkylight()} />
                <select className={styles.formSelect} value={newSkylightCat} onChange={e=>setNewSkylightCat(e.target.value)}>
                  {['Groceries','Meals / Meal prep','Chores / Cleaning','Laundry','Garbage / Recycling','Dog','Kai / Family','Errands','Other'].map(c=><option key={c}>{c}</option>)}
                </select>
                <button className={`${styles.btn} ${styles.btnDark}`} onClick={addSkylight}>Add</button>
              </div>
              <p className={styles.skylightNote}>Skylight has no connector — paste this list directly into your Skylight app.</p>
            </div>
          </Card>
        )}

        {/* ── WORK ── */}
        {tab === 'Work' && (
          <Card title="Business Tasks — Asana" link="https://app.asana.com/1/56134264439760" onRefresh={loadAsana}>
            {asanaLoading ? <Loading text="Loading Asana tasks…" /> :
              asanaError ? <Err msg={asanaError} /> :
              Object.keys(asana).length === 0 ? <Empty text="No open Asana tasks. Open Asana to review." /> :
              Object.entries(asana).map(([proj, tasks]) => (
                <div key={proj} className={styles.projectBlock}>
                  <div className={styles.projectName}>
                    <a href={tasks[0]?.projectLink||'https://app.asana.com'} target="_blank" rel="noreferrer">{proj}</a>
                  </div>
                  {tasks.slice(0,6).map(t => (
                    <div key={t.id} className={styles.workTask}>
                      <div className={`${styles.dot} ${t.overdue?styles.dotUrgent:''}`} />
                      <span style={{flex:1}}>{t.name}</span>
                      {t.due && <Tag label={fmtDate(t.due)} color={t.overdue?'red':'gray'} />}
                    </div>
                  ))}
                  {tasks.length > 6 && <div className={styles.moreLink}>+{tasks.length-6} more — <a href={tasks[0]?.projectLink} target="_blank" rel="noreferrer">view in Asana</a></div>}
                </div>
              ))
            }
          </Card>
        )}

        {/* ── BRAIN DUMP ── */}
        {tab === 'Brain Dump' && (
          <div>
            <Card title="Quick Capture">
              <p className={styles.dumpHint}>Type anything — ideas, tasks, reminders. Hit Process to have Claude sort and route everything.</p>
              <textarea className={styles.dumpInput} value={dumpText} onChange={e=>setDumpText(e.target.value)}
                placeholder="What's on your mind? Dump it all here…" rows={5} />
              <div className={styles.formRow} style={{marginTop:10}}>
                <a className={`${styles.btn} ${styles.btnDark}`}
                  href={`https://claude.ai/new?q=${encodeURIComponent('Process this brain dump and route each item. Personal tasks → Notion Personal Task List. Business tasks → Asana. Home/chores → Skylight list. Dates → Calendar.\n\n'+dumpText)}`}
                  target="_blank" rel="noreferrer">
                  Process in Claude
                </a>
                <a className={`${styles.btn}`}
                  href="https://docs.google.com/document/d/19ceULBLsauvSq3TiPstrRhaqDEMR8oMCVj8zyzCfxMA/edit"
                  target="_blank" rel="noreferrer">Open Brain Dump Doc</a>
                <button className={styles.btn} onClick={()=>setDumpText('')}>Clear</button>
              </div>
            </Card>
            <Card title="Routing Reference">
              {[
                ['Business / work tasks','Asana — correct project'],
                ['Personal admin','Notion Personal Task List'],
                ['Home / groceries / chores','Skylight copy/paste list'],
                ['Ideas, SOPs, planning','Notion'],
                ['Anything with a date','Google Calendar'],
                ['Files, docs, receipts','Google Drive'],
              ].map(([from, to]) => (
                <div key={from} className={styles.row}>
                  <div className={styles.rowMain}>
                    <div className={styles.rowTitle}>{from}</div>
                    <div className={styles.rowSub}>→ {to}</div>
                  </div>
                </div>
              ))}
            </Card>
          </div>
        )}

        {/* ── APPS ── */}
        {tab === 'Apps' && (
          <Card title="Quick Links">
            <div className={styles.appsGrid}>
              {[
                ['📅','Calendar','https://calendar.google.com'],
                ['✉️','Gmail','https://mail.google.com'],
                ['✅','Notion Tasks','https://www.notion.so/4613db7559444b929881f6615b67b27c'],
                ['💼','Asana','https://app.asana.com/1/56134264439760'],
                ['📁','Drive','https://drive.google.com'],
                ['🧠','Brain Dump','https://docs.google.com/document/d/19ceULBLsauvSq3TiPstrRhaqDEMR8oMCVj8zyzCfxMA/edit'],
                ['🍯','HoneyBook','https://app.honeybook.com'],
                ['🛋','Opulent Spaces','https://app.asana.com/1/56134264439760/project/1214779484983741'],
                ['🎨','Thirty O Nine','https://app.asana.com/1/56134264439760/project/1214779768659216'],
                ['🖨','Vertex','https://app.asana.com/1/56134264439760/project/1214779579963177'],
                ['💡','Side Hustles','https://app.asana.com/1/56134264439760/project/1214779768783366'],
                ['🏠','Skylight','#'],
              ].map(([icon, label, href]) => (
                <a key={label} className={styles.appBtn}
                  href={href === '#' ? undefined : href}
                  target={href === '#' ? undefined : '_blank'}
                  rel="noreferrer"
                  onClick={href === '#' ? (e) => { e.preventDefault(); alert('Open Skylight on your family device.') } : undefined}>
                  <span className={styles.appIcon}>{icon}</span>
                  {label}
                </a>
              ))}
            </div>
          </Card>
        )}

        {/* FOOTER */}
        <div className={styles.footer}>
          <span>Sources: Gmail · Calendar · Notion · Asana</span>
          {refreshedAt && <span>Refreshed {refreshedAt}</span>}
        </div>
      </main>
    </div>
  )
}

function defaultSkylight(): SkylightItem[] {
  return [
    { cat: 'Pets', text: "Dog food" },
    { cat: 'Pets', text: "Grab Harry's meds" },
    { cat: 'Laundry', text: "Finish laundry" },
    { cat: "Kai's Room", text: "Put things away in Kai's room" },
    { cat: "Kai's Room", text: "Add Kai's chores to Skylight" },
    { cat: 'Selling Prep', text: "Take out upholstery cleaner — clean bed, mattress, egg chair" },
    { cat: 'Selling Prep', text: "Walk through house — note items to sell" },
    { cat: 'Outside', text: "Finish and hang basketball net" },
  ]
}
