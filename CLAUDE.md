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

- **`app/`** — Next.js App Router. Route group `(dashboard)` holds all protected pages (CRM, kanban, scraper, usuarios). Auth enforced by `middleware.ts` + `(dashboard)/layout.tsx` via `requireAuth()`.
- **`app/api/`** — RESTful API routes. Key endpoints: `/leads`, `/scraper/search`, `/analyze/[leadId]`, `/generate-site/[leadId]`, `/outreach/generate-message/[leadId]`, `/users`, `/whatsapp/accounts`. All data routes scope queries by `user_id`.
- **`lib/`** — Core logic organized by domain: `claude/` (AI scoring, outreach, site generation), `supabase/` (DB clients + schema), `scraper/` (cheerio-based HTML parsing), `google-places/` (Places API), `auth/` (session verification + user CRUD with bcrypt), `whatsapp/` (account-scoped Baileys auth state).
- **`components/ui/`** — shadcn/ui components (New York style, Lucide icons). Add new ones via `npx shadcn@latest add <component>`.
- **`components/leads/`** — Lead-specific UI (detail panel, modals, status/score badges).
- **`components/users/`** — User management UI (table, create/edit/delete dialogs).
- **`types/index.ts`** — All shared TypeScript types (`Lead`, `LeadStatus`, `ScoreDetails`, `Message`, `LeadActivity`, `ScraperResult`, `AppUser`, `WhatsAppAccount`).

### Auth

Multi-user system with bcrypt password hashing and HMAC-SHA256 session tokens. `ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars auto-provision a seed user on first login. Users table in Supabase with bcrypt (12 rounds). Session stored in `leadforge_session` httpOnly cookie (7-day expiry). Token format: `base64(userId:email:timestamp).hmacSignature`. Middleware (`middleware.ts`) validates tokens on all routes (public whitelist: `/login`, `/preview/*`, `/api/auth/*`, `/api/site-generator/health`). API routes use `getSessionUser()` for user identification; Server Components use `requireAuth()`.

User management at `/usuarios` with CRUD API (`/api/users`). All data tables have `user_id` FK for data isolation — each user sees only their own leads, messages, pipeline runs, etc.

### Database

Supabase PostgreSQL with tables: `users`, `whatsapp_accounts`, `leads`, `messages`, `lead_activity`, `scraper_searches`, `whatsapp_auth`, `pipeline_runs`, `pipeline_leads`. Schema in `lib/supabase/schema.sql`, migration in `lib/supabase/migrations/001_multi_user.sql`. RLS disabled — data isolation enforced via `user_id` filtering in code. Uses `@supabase/ssr` for server-side client, `@supabase/supabase-js` for browser client.

### WhatsApp Multi-Account

Each user can have multiple WhatsApp accounts (`whatsapp_accounts` table). Baileys auth state is scoped by `account_id` in `whatsapp_auth` (composite PK: `account_id, id`). WhatsApp management at `/whatsapp` with account CRUD, QR pairing per account, and connection health checks. Autopilot page has a dropdown to select which WhatsApp number to use for sending.

### Lead Status Lifecycle

`nuevo` → `analizado` → `candidato` → `sitio_generado` → `contactado` → `en_negociacion` → `cerrado` | `descartado`

### AI Integration

Anthropic Claude SDK (`@anthropic-ai/sdk`) used for: website quality scoring (1-10 with 8-dimension breakdown), franchise/chain filtering, and personalized outreach messages (WhatsApp/email).

Site generation (`lib/claude/site-generator.ts`) uses the **website-generator prompt builder** (`lib/claude/website-generator/`), a sophisticated prompt engineering system with:
- A ~3000-line system prompt template with comprehensive design rules, animation library, and section catalog
- OKLCH color system (hex → perceptual color space with light/dark variants)
- Intelligent section selection based on data availability (21 section types)
- Industry-specific design context (15 industries)
- Data mapper (`map-lead-data.ts`) that converts LeadForge's raw scraper output into structured `ScrapedWebsiteData`, passing raw text via `customInstructions` for model extraction
- System/user prompt separation for proper API usage (Anthropic `system:` param, OpenAI `messages[0].role='system'`, Responses API `instructions:`)

Site generation is provider-configurable and defaults to OpenAI-compatible GPT-5 Codex:

- `SITE_GENERATOR_PROVIDER=openai-compatible` (default)
- `SITE_GENERATOR_MODEL=gpt-5-codex` (default)
- `SITE_GENERATOR_API_KEY=<token>` (or `OPENAI_API_KEY` / `OPENROUTER_API_KEY`)
- `SITE_GENERATOR_BASE_URL=<host>/v1` (optional; defaults to OpenAI API URL)
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
OPENAI_API_KEY
```

All config via `process.env` — no `.env.local` fallback pattern.

## Style

- Tailwind CSS v4 with Prettier plugin (auto-sorts classes)
- 100-char print width, 2-space indentation, single quotes
- Spanish-language UI and data (status names, labels, content)
