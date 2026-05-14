import { NextRequest, NextResponse } from 'next/server'
import { Client } from '@notionhq/client'
import { google } from 'googleapis'

const notion = new Client({ auth: process.env.NOTION_API_KEY })
const TASK_DB_ID = process.env.NOTION_DATABASE_ID!
const BRAIN_DUMP_DOC_ID = '19ceULBLsauvSq3TiPstrRhaqDEMR8oMCVj8zyzCfxMA'

// Setup Google OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
)
oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN
})

interface BrainDumpItem {
  text: string
  category: 'notion_tasks' | 'asana' | 'skylight' | 'calendar' | 'drive' | 'unprocessed'
  destination: string
}

// Simple routing logic based on keywords
function categorizeItem(text: string): BrainDumpItem['category'] {
  const lower = text.toLowerCase()

  // Calendar items (anything with dates)
  if (/\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}\/\d{1,2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|appointment|meeting|schedule|at \d|pm|am)\b/i.test(text)) {
    return 'calendar'
  }

  // Asana/work items
  if (/\b(work|business|project|client|asana|deadline|deliverable|proposal|meeting)\b/i.test(text)) {
    return 'asana'
  }

  // Skylight/home/chores items
  if (/\b(grocery|groceries|chore|clean|laundry|cooking|dinner|meal|pet|dog|kai|house|home|errands|shopping|store)\b/i.test(text)) {
    return 'skylight'
  }

  // Google Drive/files/docs
  if (/\b(file|document|doc|pdf|receipt|invoice|save|upload|drive|folder)\b/i.test(text)) {
    return 'drive'
  }

  // Default to Notion personal tasks
  if (/\b(personal|admin|follow[- ]?up|review|read|watch|learn|idea|sop|process)\b/i.test(text)) {
    return 'notion_tasks'
  }

  return 'notion_tasks' // Default destination
}

function getDestination(category: string): string {
  const map: Record<string, string> = {
    'notion_tasks': 'Notion Personal Task List',
    'asana': 'Asana',
    'skylight': 'Skylight',
    'calendar': 'Google Calendar',
    'drive': 'Google Drive',
    'unprocessed': 'Unprocessed'
  }
  return map[category] || 'Notion Personal Task List'
}

// Update Google Doc to mark items as forwarded
async function markForwarded(items: string[]): Promise<void> {
  try {
    const docs = google.docs({ version: 'v1', auth: oauth2Client })

    // Get document content
    const doc = await docs.documents.get({ documentId: BRAIN_DUMP_DOC_ID })
    const content = doc.data.body?.content || []

    // Find and update items
    const updates: any[] = []
    let currentIndex = 0

    for (const paragraph of content) {
      if (paragraph.paragraph?.elements) {
        for (const element of paragraph.paragraph.elements) {
          const text = element.textRun?.content || ''

          // Check if this element contains any of our items
          for (const item of items) {
            if (text.includes(item) && !text.includes('[forwarded]')) {
              // Mark as forwarded
              const startIndex = currentIndex + text.indexOf(item) + item.length
              updates.push({
                insertText: {
                  text: ' [forwarded]',
                  location: { index: startIndex }
                }
              })
            }
          }
          currentIndex += text.length
        }
      }
    }

    // Apply updates if any
    if (updates.length > 0) {
      await docs.documents.batchUpdate({
        documentId: BRAIN_DUMP_DOC_ID,
        requestBody: { requests: updates }
      })
    }
  } catch (err) {
    console.error('Error updating Google Doc:', err)
    // Continue even if marking fails
  }
}

// Add task to Notion
async function addNotionTask(text: string): Promise<void> {
  try {
    const properties: any = {
      'Task Name': { title: [{ text: { content: text } }] },
      'Category': { select: { name: 'Personal Admin' } },
      'Status': { select: { name: 'Inbox' } },
      'Priority': { select: { name: 'Medium' } },
      'Source': { select: { name: 'Brain Dump' } },
    }

    await notion.pages.create({
      parent: { database_id: TASK_DB_ID },
      properties,
    })
  } catch (err) {
    console.error('Error adding to Notion:', err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { items } = body

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'No items provided' }, { status: 400 })
    }

    const processedItems: Array<BrainDumpItem & { text: string }> = []

    // Categorize and process each item
    for (const item of items) {
      const text = typeof item === 'string' ? item : item.text
      if (!text || !text.trim()) continue

      const category = categorizeItem(text)
      const destination = getDestination(category)

      processedItems.push({
        text: text.trim(),
        category,
        destination
      })

      // Add to appropriate service
      if (category === 'notion_tasks') {
        await addNotionTask(text.trim())
      }
    }

    // Mark items as forwarded in Google Doc
    const itemTexts = processedItems.map(i => i.text)
    await markForwarded(itemTexts)

    return NextResponse.json({
      success: true,
      processed: processedItems.length,
      items: processedItems
    })
  } catch (err: any) {
    console.error('Brain dump processing error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
