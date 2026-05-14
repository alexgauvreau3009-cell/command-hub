import { NextResponse } from 'next/server'

const BASE = 'https://app.asana.com/api/1.0'
const TOKEN = process.env.ASANA_ACCESS_TOKEN
const WORKSPACE = process.env.ASANA_WORKSPACE_GID
const USER = process.env.ASANA_USER_GID

const PROJECT_LINKS: Record<string, string> = {
  'Opulent Spaces': 'https://app.asana.com/1/56134264439760/project/1214779484983741',
  'Thirty O Nine Design & Marketing': 'https://app.asana.com/1/56134264439760/project/1214779768659216',
  'Vertex Fabrication': 'https://app.asana.com/1/56134264439760/project/1214779579963177',
  'Misc Projects & Side Hustles': 'https://app.asana.com/1/56134264439760/project/1214779768783366',
}

async function asanaFetch(path: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    next: { revalidate: 0 },
  })
  if (!res.ok) throw new Error(`Asana API ${res.status}: ${await res.text()}`)
  return res.json()
}

export async function GET() {
  try {
    const data = await asanaFetch(
      `/tasks?assignee=${USER}&workspace=${WORKSPACE}&completed_since=now&opt_fields=name,due_on,completed,projects.name,assignee_status&limit=100`
    )

    const tasks = (data.data || []).filter((t: any) => !t.completed)

    // Group by project
    const grouped: Record<string, any[]> = {}
    tasks.forEach((t: any) => {
      const proj = t.projects?.[0]?.name || 'Other'
      if (!grouped[proj]) grouped[proj] = []
      grouped[proj].push({
        id: t.gid,
        name: t.name,
        due: t.due_on,
        project: proj,
        projectLink: PROJECT_LINKS[proj] || 'https://app.asana.com/1/56134264439760',
        overdue: t.due_on ? new Date(t.due_on) < new Date() : false,
      })
    })

    return NextResponse.json({ grouped, total: tasks.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
