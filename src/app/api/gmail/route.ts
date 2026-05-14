import { NextResponse } from 'next/server'
import { google } from 'googleapis'

export const dynamic = 'force-dynamic'

function getAuth() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  )
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return oauth2
}

const PRIORITY_RULES = [
  { pattern: /cra|revenue canada|tax|notice of assessment/i, priority: 1, tag: 'Legal/CRA' },
  { pattern: /court|legal|lawyer|attorney|custody|insurance claim/i, priority: 1, tag: 'Legal/CRA' },
  { pattern: /bark\.com|honeybook|client inquiry|new lead/i, priority: 1, tag: 'Client Lead' },
  { pattern: /shapr3d|vertex|3d print|supplier|order|shipping/i, priority: 2, tag: 'Business' },
  { pattern: /school|teacher|kai|report card/i, priority: 2, tag: 'Kai/School' },
  { pattern: /invoice|payment|overdue|e-transfer|interac/i, priority: 2, tag: 'Invoice' },
  { pattern: /unsubscribe|newsletter|promo|discount|sale/i, priority: 3, tag: 'Newsletter' },
]

function classifyEmail(subject: string, from: string) {
  const text = `${subject} ${from}`.toLowerCase()
  for (const rule of PRIORITY_RULES) {
    if (rule.pattern.test(text)) return { priority: rule.priority, tag: rule.tag }
  }
  return { priority: 2, tag: 'Personal' }
}

export async function GET() {
  try {
    const auth = getAuth()
    const gmail = google.gmail({ version: 'v1', auth })

    const list = await gmail.users.messages.list({
      userId: 'me',
      q: 'is:unread newer_than:2d',
      maxResults: 20,
    })

    const messages = list.data.messages || []
    if (!messages.length) return NextResponse.json({ emails: [] })

    const emails = await Promise.all(
      messages.slice(0, 15).map(async msg => {
        try {
          const full = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id!,
            format: 'metadata',
            metadataHeaders: ['Subject', 'From', 'Date'],
          })
          const headers = full.data.payload?.headers || []
          const get = (name: string) => headers.find(h => h.name === name)?.value || ''
          const subject = get('Subject')
          const from = get('From')
          const { priority, tag } = classifyEmail(subject, from)
          return {
            id: msg.id,
            subject,
            from,
            date: get('Date'),
            snippet: full.data.snippet || '',
            priority,
            tag,
            threadId: full.data.threadId,
          }
        } catch {
          return null
        }
      })
    )

    const filtered = emails
      .filter(Boolean)
      .sort((a: any, b: any) => a.priority - b.priority)

    return NextResponse.json({ emails: filtered })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
