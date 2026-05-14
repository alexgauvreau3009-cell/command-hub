import { NextRequest, NextResponse } from 'next/server'
import { Client } from '@notionhq/client'

const notion = new Client({ auth: process.env.NOTION_API_KEY })
const DB_ID = process.env.NOTION_DATABASE_ID!

function extractText(prop: any): string {
  if (!prop) return ''
  if (prop.type === 'title') return prop.title?.map((t: any) => t.plain_text).join('') || ''
  if (prop.type === 'rich_text') return prop.rich_text?.map((t: any) => t.plain_text).join('') || ''
  if (prop.type === 'select') return prop.select?.name || ''
  if (prop.type === 'date') return prop.date?.start || ''
  return ''
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const filter = searchParams.get('filter') || 'active'

    let filterObj: any = undefined
    if (filter === 'today') {
      filterObj = { property: 'Status', select: { equals: 'Today' } }
    } else if (filter === 'week') {
      filterObj = { or: [
        { property: 'Status', select: { equals: 'Today' } },
        { property: 'Status', select: { equals: 'This Week' } }
      ]}
    } else if (filter === 'done') {
      filterObj = { property: 'Status', select: { equals: 'Done' } }
    } else if (filter === 'active') {
      filterObj = { property: 'Status', select: { does_not_equal: 'Done' } }
    }

    const response = await notion.databases.query({
      database_id: DB_ID,
      filter: filterObj,
      sorts: [
        { property: 'Status', direction: 'ascending' },
        { property: 'Priority', direction: 'ascending' },
      ],
      page_size: 50,
    })

    const tasks = response.results.map((page: any) => ({
      id: page.id,
      url: page.url,
      title: extractText(page.properties['Task Name']),
      status: extractText(page.properties['Status']),
      priority: extractText(page.properties['Priority']),
      category: extractText(page.properties['Category']),
      due: extractText(page.properties['Due Date']),
      notes: extractText(page.properties['Notes']),
    }))

    return NextResponse.json({ tasks })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { title, category, status, priority, due, notes } = body

    const properties: any = {
      'Task Name': { title: [{ text: { content: title } }] },
      'Category': { select: { name: category || 'Personal Admin' } },
      'Status': { select: { name: status || 'Inbox' } },
      'Priority': { select: { name: priority || 'Medium' } },
      'Source': { select: { name: 'Manual' } },
    }
    if (due) properties['Due Date'] = { date: { start: due } }
    if (notes) properties['Notes'] = { rich_text: [{ text: { content: notes } }] }

    const page = await notion.pages.create({
      parent: { database_id: DB_ID },
      properties,
    })

    return NextResponse.json({ id: (page as any).id, url: (page as any).url })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, status } = await req.json()
    await notion.pages.update({
      page_id: id,
      properties: {
        'Status': { select: { name: status } },
      },
    })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
