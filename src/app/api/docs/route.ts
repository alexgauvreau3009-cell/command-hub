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

const BRAIN_DUMP_DOC_ID = '19ceULBLsauvSq3TiPstrRhaqDEMR8oMCVj8zyzCfxMA'

export async function GET() {
  try {
    const auth = getAuth()
    const docs = google.docs({ version: 'v1', auth })

    const doc = await docs.documents.get({
      documentId: BRAIN_DUMP_DOC_ID,
    })

    // Extract text content with line numbers for tracking
    const content = doc.data.body?.content || []
    const lines: Array<{ text: string; elementId?: string }> = []

    content.forEach(element => {
      if (element.paragraph) {
        let text = ''
        element.paragraph.elements?.forEach(el => {
          if (el.textRun) {
            text += el.textRun.content
          }
        })
        if (text.trim() && !text.includes('✓ Forwarded')) {
          lines.push({
            text: text.trim(),
            elementId: element.paragraph.elements?.[0]?.textRun?.content ? element.paragraph.paragraphStyle?.headingId : undefined
          })
        }
      }
    })

    return NextResponse.json({ lines, docId: BRAIN_DUMP_DOC_ID })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

interface UpdateRequest {
  updates: Array<{
    text: string
    service: 'Notion' | 'Asana' | 'Calendar' | 'Skylight'
  }>
}

export async function POST(req: Request) {
  try {
    const { updates } = await req.json() as UpdateRequest

    if (!updates || !Array.isArray(updates)) {
      return NextResponse.json({ error: 'Invalid updates' }, { status: 400 })
    }

    const auth = getAuth()
    const docs = google.docs({ version: 'v1', auth })

    // Get current document
    const doc = await docs.documents.get({
      documentId: BRAIN_DUMP_DOC_ID,
    })

    const requests: any[] = []
    const content = doc.data.body?.content || []

    // Find and update each item
    updates.forEach(({ text, service }) => {
      content.forEach((element, idx) => {
        if (element.paragraph) {
          let fullText = ''
          element.paragraph.elements?.forEach(el => {
            if (el.textRun) fullText += el.textRun.content
          })

          // Check if this paragraph contains the text we're looking for
          if (fullText.includes(text) && !fullText.includes('✓ Forwarded')) {
            // Add forwarded note at the end of the paragraph
            const insertIndex = element.paragraph.elements?.length || 0

            requests.push({
              insertText: {
                text: ` ✓ Forwarded to ${service}`,
                location: {
                  index: (element.startIndex || 0) + fullText.length,
                },
              },
            })

            // Make the forwarded note gray/lighter
            requests.push({
              updateTextStyle: {
                range: {
                  startIndex: (element.startIndex || 0) + fullText.length,
                  endIndex: (element.startIndex || 0) + fullText.length + ` ✓ Forwarded to ${service}`.length,
                },
                textStyle: {
                  foregroundColor: {
                    color: {
                      rgbColor: {
                        red: 0.6,
                        green: 0.6,
                        blue: 0.6,
                      },
                    },
                  },
                  italic: true,
                },
                fields: 'foregroundColor,italic',
              },
            })
          }
        }
      })
    })

    if (requests.length === 0) {
      return NextResponse.json({ updated: 0 })
    }

    // Execute batch update
    await docs.documents.batchUpdate({
      documentId: BRAIN_DUMP_DOC_ID,
      requestBody: { requests },
    })

    return NextResponse.json({ updated: updates.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
