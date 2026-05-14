# Alex Command Hub — PWA

Your personal daily operations dashboard. Runs as a home-screen app on your phone.

---

## What it does

| Tab | Source |
|-----|--------|
| **Focus** | Today's priorities from Notion + Calendar |
| **Calendar** | Google Calendar (today's events) |
| **Email** | Gmail — unread from last 2 days, auto-prioritised |
| **Tasks** | Notion Personal Task List (filterable, mark done, add new) |
| **Skylight** | Local list — build it here, copy/paste into Skylight |
| **Work** | Asana — all open tasks grouped by project |
| **Brain Dump** | Quick capture → routes to Claude for processing |
| **Apps** | Quick links to every tool |

---

## Setup

### 1. Copy the env file

```bash
cp .env.local.example .env.local
```

Then fill in the values (instructions inside the file).

### 2. Get your API keys

**Notion**
1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations) → New Integration
2. Copy the secret → `NOTION_API_KEY`
3. Share your "Personal Task List" database with the integration
4. The `NOTION_DATABASE_ID` is already filled in

**Google (Gmail + Calendar)**
1. [console.cloud.google.com](https://console.cloud.google.com) → Create project
2. Enable Gmail API + Google Calendar API
3. Credentials → OAuth 2.0 Client ID (Web app) → add `http://localhost:3000` to redirect URIs
4. Copy Client ID + Secret into `.env.local`
5. Get your refresh token — run the helper script once:

```bash
node scripts/get-token.js
```

(Follow the URL it prints, approve, paste the code back — it prints your refresh token.)

**Asana**
1. [app.asana.com/0/my-apps](https://app.asana.com/0/my-apps) → New Access Token
2. Copy into `ASANA_ACCESS_TOKEN`
3. Your workspace and user GIDs are already filled in

### 3. Install & run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 4. Install to your phone

1. Open `http://YOUR_LOCAL_IP:3000` in Safari (iPhone) or Chrome (Android)
2. Share → Add to Home Screen
3. Done — it runs like a native app

---

## Deploy (optional — for access anywhere)

Easiest option: [Vercel](https://vercel.com) — free, one-click.

```bash
npx vercel
```

Add your `.env.local` values in Vercel's dashboard under Project → Settings → Environment Variables.

---

## File structure

```
src/app/
  page.tsx              ← Main UI (all tabs)
  page.module.css       ← All styles
  layout.tsx            ← PWA meta tags
  globals.css           ← CSS variables + base styles
  api/
    asana/route.ts      ← Asana tasks API
    calendar/route.ts   ← Google Calendar API
    gmail/route.ts      ← Gmail API
    notion/tasks/route.ts ← Notion tasks API (GET/POST/PATCH)
public/
  manifest.json         ← PWA manifest
  sw.js                 ← Service worker (offline shell)
  icon-192.png          ← App icons
  icon-512.png
```
