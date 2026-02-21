# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start dev server on localhost:3000
npm run build      # Production build
npm run start      # Start production server
npm run lint       # ESLint (Next.js + TypeScript presets)
```

No test suite is configured.

## Architecture

LeadForge is a Next.js 16 (App Router) TypeScript application for prospecting local businesses. It searches Google Places, scrapes/analyzes websites with Claude AI, generates proposal sites, and tracks leads through a sales pipeline.

**Deployed on Railway** — fetch+cheerio for scraping (no Puppeteer).

### Key Layers

- **`app/`** — Next.js App Router. Route group `(dashboard)` holds all protected pages (CRM, kanban, scraper). Auth is enforced in `(dashboard)/layout.tsx` via `requireAuth()`, not middleware.
- **`app/api/`** — RESTful API routes. Key endpoints: `/leads`, `/scraper/search`, `/analyze/[leadId]`, `/generate-site/[leadId]`, `/outreach/generate-message/[leadId]`.
- **`lib/`** — Core logic organized by domain: `claude/` (AI scoring, outreach, site generation), `supabase/` (DB clients + schema), `scraper/` (cheerio-based HTML parsing), `google-places/` (Places API), `auth/` (HMAC-SHA256 session verification).
- **`components/ui/`** — shadcn/ui components (New York style, Lucide icons). Add new ones via `npx shadcn@latest add <component>`.
- **`components/leads/`** — Lead-specific UI (detail panel, modals, status/score badges).
- **`types/index.ts`** — All shared TypeScript types (`Lead`, `LeadStatus`, `ScoreDetails`, `Message`, `LeadActivity`, `ScraperResult`).

### Auth

Single-user MVP with custom HMAC-SHA256 tokens. Credentials are `ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars. Session stored in `leadforge_session` httpOnly cookie (7-day expiry). No OAuth, no JWT library.

### Database

Supabase PostgreSQL with three tables: `leads`, `messages`, `lead_activity`. Schema defined in `lib/supabase/schema.sql`. RLS is disabled. Uses `@supabase/ssr` for server-side client, `@supabase/supabase-js` for browser client.

### Lead Status Lifecycle

`nuevo` → `analizado` → `candidato` → `sitio_generado` → `contactado` → `en_negociacion` → `cerrado` | `descartado`

### AI Integration

Anthropic Claude SDK (`@anthropic-ai/sdk`) used for: website quality scoring (1-10 with 8-dimension breakdown), franchise/chain filtering, and personalized outreach messages (WhatsApp/email).

Site generation (`lib/claude/site-generator.ts`) is provider-configurable and defaults to OpenAI-compatible Qwen:

- `SITE_GENERATOR_PROVIDER=openai-compatible` (default)
- `SITE_GENERATOR_MODEL=qwen/qwen3-coder-30b-a3b-instruct` (default)
- `SITE_GENERATOR_API_KEY=<token>` (or `OPENROUTER_API_KEY`)
- `SITE_GENERATOR_BASE_URL=<host>/v1` (optional; defaults to OpenRouter API URL)
- Optional Anthropic fallback mode for site generation:
  - `SITE_GENERATOR_PROVIDER=anthropic`
  - `SITE_GENERATOR_ANTHROPIC_MODEL=claude-sonnet-4-6`
- Health check endpoint for model connectivity before pipeline runs:
  - `GET /api/site-generator/health`
  - Optional query param: `timeoutMs` (1000-60000)

### Path Aliases

`@/*` maps to the project root (e.g., `@/lib/utils`, `@/components/ui/button`).

## Environment Variables

```
ADMIN_EMAIL, ADMIN_PASSWORD, SESSION_SECRET
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
ANTHROPIC_API_KEY
GOOGLE_PLACES_API_KEY
SITE_GENERATOR_PROVIDER, SITE_GENERATOR_MODEL, SITE_GENERATOR_API_KEY, SITE_GENERATOR_BASE_URL
```

All config via `process.env` — no `.env.local` fallback pattern.

## Style

- Tailwind CSS v4 with Prettier plugin (auto-sorts classes)
- 100-char print width, 2-space indentation, single quotes
- Spanish-language UI and data (status names, labels, content)
