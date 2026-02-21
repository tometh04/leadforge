import { createServiceClient } from '@/lib/supabase/service'
import { searchPlaces, fetchPlaceDetails } from '@/lib/google-places/client'
import { quickLeadFilter, analyzeWebsite } from '@/lib/claude/scoring'
import { scrapeSite } from '@/lib/scraper/site-scraper'
import { generateSiteHTML, slugify, ScrapedBusinessData } from '@/lib/claude/site-generator'
import { generateWhatsAppMessage, buildDefaultMessage } from '@/lib/claude/outreach'
import { isAnthropicRateLimitError } from '@/lib/claude/retry'
import { createWhatsAppSocket, waitForConnection, formatPhoneToJid } from '@/lib/whatsapp/client'
import type { ScraperResult } from '@/types'

// ─── Types ──────────────────────────────────────────────────────────────────────

interface PipelineConfig {
  niche: string
  city: string
  maxResults: number
  skipAnalysis: boolean
  skipSiteGeneration: boolean
  skipMessages: boolean
  skipSending: boolean
}

// ─── Utilities ──────────────────────────────────────────────────────────────────

export async function pMap<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  concurrency: number
): Promise<void> {
  let idx = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++
      await fn(items[i])
    }
  })
  await Promise.all(workers)
}

export async function triggerNextStage(
  runId: string,
  stage: string,
  fromPhase: 'a' | 'b' | 'init' = 'init'
) {
  const nextPhase = fromPhase === 'a' ? 'b' : 'a'
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  const url = `${baseUrl}/api/pipeline/run/continue-${nextPhase}`
  const body = JSON.stringify({ runId, stage })

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
      if (res.ok) return
      console.error(`[triggerNextStage] Attempt ${attempt + 1} failed: ${res.status}`)
    } catch (err) {
      console.error(`[triggerNextStage] Attempt ${attempt + 1} error:`, err)
    }
    if (attempt < 2) {
      const delayMs = [2000, 5000][attempt] ?? 10000
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  throw new Error(`Failed to trigger stage "${stage}" after 3 attempts`)
}

function getNextStage(current: string, config: PipelineConfig): string | null {
  const order = [
    'search',
    'import',
    ...(config.skipAnalysis ? [] : ['analyze']),
    ...(config.skipSiteGeneration ? [] : ['generate_sites']),
    ...(config.skipMessages ? [] : ['generate_messages']),
    ...(config.skipSending ? [] : ['send']),
  ]
  const idx = order.indexOf(current)
  return idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null
}

function createRunHelpers(runId: string) {
  const supabase = createServiceClient()

  const updateRun = async (updates: Record<string, unknown>) => {
    await supabase
      .from('pipeline_runs')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', runId)
  }

  const updatePipelineLead = async (plId: string, updates: Record<string, unknown>) => {
    await supabase.from('pipeline_leads').update(updates).eq('id', plId)
  }

  const isCancelled = async (): Promise<boolean> => {
    const { data } = await supabase
      .from('pipeline_runs')
      .select('status')
      .eq('id', runId)
      .single()
    return data?.status === 'cancelled'
  }

  return { supabase, updateRun, updatePipelineLead, isCancelled }
}

// ─── Stage dispatcher ───────────────────────────────────────────────────────────

export async function processStage(runId: string, stage: string, fromPhase: 'a' | 'b' | 'init' = 'init') {
  const supabase = createServiceClient()

  // Fetch config from the pipeline_runs row
  const { data: run } = await supabase
    .from('pipeline_runs')
    .select('config, status')
    .eq('id', runId)
    .single()

  if (!run || run.status === 'cancelled') return

  const config = run.config as PipelineConfig

  try {
    switch (stage) {
      case 'search':
        await stageSearch(runId, config, fromPhase)
        break
      case 'import':
        await stageImport(runId, config, fromPhase)
        break
      case 'analyze':
        await stageAnalyze(runId, config, fromPhase)
        break
      case 'generate_sites':
        await stageGenerateSites(runId, config, fromPhase)
        break
      case 'generate_messages':
        await stageGenerateMessages(runId, config, fromPhase)
        break
      case 'send':
        await stageSend(runId, config, fromPhase)
        break
      default:
        console.error(`[pipeline/stages] Unknown stage: ${stage}`)
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Error desconocido'

    if (isAnthropicRateLimitError(err)) {
      console.warn(`[pipeline/stages] Rate limit in stage ${stage}. Keeping run active for retry.`)
      await supabase
        .from('pipeline_runs')
        .update({ status: 'running', updated_at: new Date().toISOString() })
        .eq('id', runId)
      return
    }

    console.error(`[pipeline/stages] Fatal error in stage ${stage}:`, errMsg)
    await supabase
      .from('pipeline_runs')
      .update({ status: 'failed', stage: 'error', updated_at: new Date().toISOString() })
      .eq('id', runId)
  }
}

async function advanceOrComplete(
  runId: string,
  currentStage: string,
  config: PipelineConfig,
  fromPhase: 'a' | 'b' | 'init' = 'init'
) {
  const next = getNextStage(currentStage, config)
  if (next) {
    await triggerNextStage(runId, next, fromPhase)
  } else {
    const supabase = createServiceClient()
    await supabase
      .from('pipeline_runs')
      .update({
        status: 'completed',
        stage: 'done',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', runId)
  }
}

// ─── Stage: Search ──────────────────────────────────────────────────────────────

async function stageSearch(runId: string, config: PipelineConfig, fromPhase: 'a' | 'b' | 'init') {
  const { supabase, updateRun, isCancelled } = createRunHelpers(runId)

  await updateRun({ stage: 'searching' })

  const fetchCount = Math.min(config.maxResults * 2, 60)
  const places = await searchPlaces(config.niche, config.city, fetchCount)

  if (places.length === 0) {
    await updateRun({ status: 'completed', stage: 'done', completed_at: new Date().toISOString() })
    return
  }

  // Check duplicates
  const placeIds = places.map((p) => p.place_id)
  const { data: existingLeads } = await supabase
    .from('leads')
    .select('place_id')
    .in('place_id', placeIds)
  const existingIds = new Set(existingLeads?.map((l) => l.place_id) ?? [])

  // Quick franchise filter
  const newPlaces = places.filter((p) => !existingIds.has(p.place_id))
  const batchSize = 5
  const viabilityMap = new Map<string, boolean>()

  for (let i = 0; i < newPlaces.length; i += batchSize) {
    const batch = newPlaces.slice(i, i + batchSize)
    const evaluations = await Promise.allSettled(
      batch.map((p) => quickLeadFilter(p.business_name, p.website, p.category))
    )
    evaluations.forEach((result, idx) => {
      const viable = result.status === 'fulfilled' ? result.value.viable : true
      viabilityMap.set(batch[idx].place_id, viable)
    })
  }

  const viableResults: ScraperResult[] = places
    .filter((p) => {
      if (existingIds.has(p.place_id)) return false
      return viabilityMap.get(p.place_id) !== false
    })
    .slice(0, config.maxResults)

  if (viableResults.length === 0) {
    await updateRun({ status: 'completed', stage: 'done', completed_at: new Date().toISOString() })
    return
  }

  // Store viable results for the import stage
  await supabase
    .from('pipeline_runs')
    .update({
      search_results: viableResults,
      updated_at: new Date().toISOString(),
    })
    .eq('id', runId)

  if (await isCancelled()) return

  await advanceOrComplete(runId, 'search', config, fromPhase)
}

// ─── Stage: Import ──────────────────────────────────────────────────────────────

async function stageImport(runId: string, config: PipelineConfig, fromPhase: 'a' | 'b' | 'init') {
  const { supabase, updateRun, isCancelled } = createRunHelpers(runId)

  await updateRun({ stage: 'importing' })

  // Read search results stored by the search stage
  const { data: run } = await supabase
    .from('pipeline_runs')
    .select('search_results')
    .eq('id', runId)
    .single()

  const viableResults: ScraperResult[] = (run?.search_results as ScraperResult[]) ?? []

  if (viableResults.length === 0) {
    await updateRun({ status: 'completed', stage: 'done', completed_at: new Date().toISOString() })
    return
  }

  const toInsert = viableResults.map((lead) => ({
    place_id: lead.place_id,
    business_name: lead.business_name,
    address: lead.address,
    phone: lead.phone,
    website: lead.website,
    rating: lead.rating,
    category: lead.category,
    google_photo_url: lead.google_photo_url,
    niche: config.niche,
    city: config.city,
    status: 'nuevo',
  }))

  await supabase
    .from('leads')
    .upsert(toInsert, { onConflict: 'place_id', ignoreDuplicates: true })

  // Fetch imported leads with their DB IDs
  const { data: importedLeads } = await supabase
    .from('leads')
    .select('id, business_name, phone, website, status, place_id')
    .in(
      'place_id',
      viableResults.map((r) => r.place_id)
    )

  const dbLeads = importedLeads ?? []

  // Create pipeline_leads rows
  const pipelineLeadRows = dbLeads.map((l) => ({
    run_id: runId,
    lead_id: l.id,
    business_name: l.business_name,
    phone: l.phone || '',
    status: l.status === 'contactado' ? 'skipped' : 'pending',
  }))

  const { data: insertedPipelineLeads } = await supabase
    .from('pipeline_leads')
    .insert(pipelineLeadRows)
    .select()

  const pLeads = insertedPipelineLeads ?? []

  await updateRun({ total_leads: pLeads.length })

  if (await isCancelled()) return

  await advanceOrComplete(runId, 'import', config, fromPhase)
}

// ─── Stage: Analyze ─────────────────────────────────────────────────────────────

async function stageAnalyze(runId: string, config: PipelineConfig, fromPhase: 'a' | 'b' | 'init') {
  const { supabase, updateRun, updatePipelineLead, isCancelled } = createRunHelpers(runId)

  await updateRun({ stage: 'analyzing' })

  const { data: pLeads } = await supabase
    .from('pipeline_leads')
    .select('*')
    .eq('run_id', runId)

  // Fetch all lead data we need
  const leadIds = (pLeads ?? []).map((pl) => pl.lead_id).filter(Boolean)
  const { data: dbLeadsRaw } = await supabase
    .from('leads')
    .select('id, business_name, phone, website, status, place_id')
    .in('id', leadIds)
  const dbLeads = dbLeadsRaw ?? []

  let analyzedCount = 0
  let cancelled = false

  const processLead = async (pl: (typeof pLeads extends (infer T)[] | null ? T : never)) => {
    if (cancelled || (await isCancelled())) {
      cancelled = true
      return
    }
    if (pl.status === 'skipped') return

    const dbLead = dbLeads.find((l) => l.id === pl.lead_id)
    if (!dbLead?.website) {
      await updatePipelineLead(pl.id, { status: 'error', error: 'Sin website' })
      return
    }

    await updatePipelineLead(pl.id, { status: 'analyzing' })

    try {
      const scraped = await scrapeSite(dbLead.website)
      const { score, details } = await analyzeWebsite(dbLead.website, scraped)
      const newStatus = score < 6 ? 'candidato' : 'analizado'

      await supabase
        .from('leads')
        .update({
          score,
          score_summary: details.summary,
          score_details: {
            ...details,
            site_type: scraped.siteType,
            scraped_images: scraped.imageUrls.slice(0, 8),
            logo_url: scraped.logoUrl,
            social_links: scraped.socialLinks,
            visible_text: scraped.visibleText.slice(0, 2000),
            emails: scraped.emails,
            page_title: scraped.title,
            meta_description: scraped.description,
            sub_pages_text: scraped.subPagesText.slice(0, 6000),
            sub_pages_count: scraped.subPagesCount,
          },
          status: newStatus,
        })
        .eq('id', pl.lead_id)

      await supabase.from('lead_activity').insert({
        lead_id: pl.lead_id,
        action: 'analizado',
        detail: `Score: ${score}/10 — Tipo: ${scraped.siteType} — ${newStatus === 'candidato' ? 'Candidato' : 'Analizado'}`,
      })

      await updatePipelineLead(pl.id, { status: 'analyzed', score })
      analyzedCount++
      await updateRun({ analyzed: analyzedCount })
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Error al analizar'
      await updatePipelineLead(pl.id, { status: 'error', error: errMsg })
    }
  }

  await pMap(pLeads ?? [], processLead, 5)

  if (cancelled) return

  await advanceOrComplete(runId, 'analyze', config, fromPhase)
}

// ─── Stage: Generate Sites ──────────────────────────────────────────────────────

async function stageGenerateSites(runId: string, config: PipelineConfig, fromPhase: 'a' | 'b' | 'init') {
  const { supabase, updateRun, updatePipelineLead, isCancelled } = createRunHelpers(runId)

  await updateRun({ stage: 'generating_sites' })

  const { data: freshPLeads } = await supabase
    .from('pipeline_leads')
    .select('*')
    .eq('run_id', runId)

  let sitesCount = 0
  let cancelled = false

  const processLead = async (pl: (typeof freshPLeads extends (infer T)[] | null ? T : never)) => {
    if (cancelled || (await isCancelled())) {
      cancelled = true
      return
    }
    if (pl.status === 'skipped' || pl.status === 'error') return
    if (pl.score && pl.score >= 6) {
      await updatePipelineLead(pl.id, { status: 'skipped' })
      return
    }

    await updatePipelineLead(pl.id, { status: 'generating_site', error: null })

    try {
      const { data: lead } = await supabase
        .from('leads')
        .select(
          'id, business_name, category, niche, address, phone, website, place_id, rating, google_photo_url, score_details'
        )
        .eq('id', pl.lead_id)
        .single()

      if (!lead) {
        await updatePipelineLead(pl.id, { status: 'error', error: 'Lead no encontrado' })
        return
      }

      const existingDetails = (lead.score_details ?? {}) as Record<string, unknown>
      const rawLogoUrl = (existingDetails.logo_url as string | null) ?? null
      const rawImages = (existingDetails.scraped_images as string[]) ?? []

      const ICON_URL_KEYWORDS = [
        'logo',
        'icon',
        'favicon',
        'sprite',
        'whatsapp',
        'facebook',
        'instagram',
        'twitter',
        'badge',
        'btn',
        'arrow',
        'close',
        'menu',
      ]
      const filteredImages = rawImages.filter((url: string) => {
        const u = url.toLowerCase()
        if (rawLogoUrl && u === rawLogoUrl.toLowerCase()) return false
        if (ICON_URL_KEYWORDS.some((kw) => u.includes(kw))) return false
        return true
      })

      const scrapedData: ScrapedBusinessData | undefined = existingDetails.visible_text
        ? {
            visibleText: existingDetails.visible_text as string,
            imageUrls: filteredImages,
            logoUrl: rawLogoUrl,
            socialLinks: (existingDetails.social_links as { platform: string; url: string }[]) ?? [],
            siteType: (existingDetails.site_type as string) ?? undefined,
            googlePhotoUrl: lead.google_photo_url ?? null,
            emails: (existingDetails.emails as string[]) ?? [],
            pageTitle: (existingDetails.page_title as string) ?? '',
            metaDescription: (existingDetails.meta_description as string) ?? '',
            subPagesText: (existingDetails.sub_pages_text as string) ?? '',
            subPagesCount: (existingDetails.sub_pages_count as number) ?? 0,
          }
        : lead.google_photo_url
          ? { googlePhotoUrl: lead.google_photo_url }
          : undefined

      let openingHours: string[] | null = null
      let googleRating: number | null = lead.rating ?? null
      let googleReviewCount: number | null = null

      if (existingDetails.opening_hours) {
        openingHours = existingDetails.opening_hours as string[]
      }
      if (lead.place_id) {
        try {
          const details = await fetchPlaceDetails(lead.place_id)
          if (details.openingHours) openingHours = details.openingHours
          if (details.rating) googleRating = details.rating
          if (details.userRatingCount) googleReviewCount = details.userRatingCount
        } catch {
          // fetchPlaceDetails failed, continue with what we have
        }
      }

      const allImageUrls: string[] = []
      if (scrapedData?.googlePhotoUrl) allImageUrls.push(scrapedData.googlePhotoUrl)
      if (scrapedData?.imageUrls) {
        for (const url of scrapedData.imageUrls) {
          if (!allImageUrls.includes(url) && url !== rawLogoUrl) {
            allImageUrls.push(url)
          }
        }
      }

      const html = await generateSiteHTML({
        businessName: lead.business_name,
        category: lead.category ?? lead.niche,
        address: lead.address ?? '',
        phone: lead.phone ?? '',
        scraped: scrapedData,
        googleRating,
        googleReviewCount,
        openingHours,
        imageUrls: allImageUrls,
        logoUrl: rawLogoUrl,
      })

      const slug = `${slugify(lead.business_name)}-${lead.id.slice(0, 6)}`
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
      const previewUrl = `${appUrl}/preview/${slug}`

      const { site_html: _old, site_slug: _oldSlug, ...scoreOnly } = existingDetails
      await supabase
        .from('leads')
        .update({
          generated_site_url: previewUrl,
          status: 'sitio_generado',
          score_details: {
            ...scoreOnly,
            site_html: html,
            site_slug: slug,
            ...(openingHours ? { opening_hours: openingHours } : {}),
          },
        })
        .eq('id', lead.id)

      await supabase.from('lead_activity').insert({
        lead_id: lead.id,
        action: 'sitio_generado',
        detail: `Sitio generado: ${previewUrl}`,
      })

      await updatePipelineLead(pl.id, { status: 'site_generated', site_url: previewUrl })
      sitesCount++
      await updateRun({ sites_generated: sitesCount })
    } catch (err) {
      if (isAnthropicRateLimitError(err)) {
        await updatePipelineLead(pl.id, {
          status: 'pending',
          error: 'Rate limit de IA. Reintentando automáticamente.',
        })
        throw err
      }
      const errMsg = err instanceof Error ? err.message : 'Error generando sitio'
      await updatePipelineLead(pl.id, { status: 'error', error: errMsg })
    }
  }

  await pMap(freshPLeads ?? [], processLead, 1)

  if (cancelled) return

  await advanceOrComplete(runId, 'generate_sites', config, fromPhase)
}

// ─── Stage: Generate Messages ───────────────────────────────────────────────────

async function stageGenerateMessages(runId: string, config: PipelineConfig, fromPhase: 'a' | 'b' | 'init') {
  const { supabase, updateRun, updatePipelineLead, isCancelled } = createRunHelpers(runId)

  await updateRun({ stage: 'generating_messages' })

  const { data: freshPLeads } = await supabase
    .from('pipeline_leads')
    .select('*')
    .eq('run_id', runId)

  let messagesCount = 0
  let cancelled = false

  const processLead = async (pl: (typeof freshPLeads extends (infer T)[] | null ? T : never)) => {
    if (cancelled || (await isCancelled())) {
      cancelled = true
      return
    }
    if (!pl.phone) return
    if (pl.status === 'skipped' || pl.status === 'error') return

    await updatePipelineLead(pl.id, { status: 'generating_message', error: null })

    try {
      const { data: lead } = await supabase
        .from('leads')
        .select('*')
        .eq('id', pl.lead_id)
        .single()

      if (!lead) {
        await updatePipelineLead(pl.id, { status: 'error', error: 'Lead no encontrado' })
        return
      }

      let message: string
      try {
        message = await generateWhatsAppMessage(
          lead.business_name,
          lead.category ?? lead.niche,
          lead.address ?? '',
          lead.generated_site_url
        )
      } catch (err) {
        if (isAnthropicRateLimitError(err)) throw err
        message = buildDefaultMessage(lead.business_name, lead.generated_site_url)
      }

      await updatePipelineLead(pl.id, { status: 'message_ready', message })
      messagesCount++
    } catch (err) {
      if (isAnthropicRateLimitError(err)) {
        await updatePipelineLead(pl.id, {
          status: 'pending',
          error: 'Rate limit de IA. Reintentando automáticamente.',
        })
        throw err
      }
      const errMsg = err instanceof Error ? err.message : 'Error generando mensaje'
      await updatePipelineLead(pl.id, { status: 'error', error: errMsg })
    }
  }

  await pMap(freshPLeads ?? [], processLead, 1)

  if (cancelled) return

  await updateRun({ messages_sent: messagesCount })

  await advanceOrComplete(runId, 'generate_messages', config, fromPhase)
}

// ─── Stage: Send ────────────────────────────────────────────────────────────────

async function stageSend(runId: string, config: PipelineConfig, fromPhase: 'a' | 'b' | 'init') {
  const { supabase, updateRun, updatePipelineLead, isCancelled } = createRunHelpers(runId)

  await updateRun({ stage: 'sending' })

  const { data: freshPLeads } = await supabase
    .from('pipeline_leads')
    .select('*')
    .eq('run_id', runId)

  const toSend = (freshPLeads ?? []).filter(
    (pl) => pl.message && pl.phone && pl.status === 'message_ready'
  )

  let sentCount = 0

  if (toSend.length > 0) {
    let sock: Awaited<ReturnType<typeof createWhatsAppSocket>>['sock'] | null = null

    try {
      const socketResult = await createWhatsAppSocket()
      sock = socketResult.sock
      await waitForConnection(sock, 15000)

      for (let i = 0; i < toSend.length; i++) {
        if (await isCancelled()) {
          sock.end(undefined)
          return
        }

        const pl = toSend[i]
        await updatePipelineLead(pl.id, { status: 'sending' })

        try {
          const jid = formatPhoneToJid(pl.phone)
          await sock.sendMessage(jid, { text: pl.message })

          await supabase.from('messages').insert({
            lead_id: pl.lead_id,
            channel: 'whatsapp',
            message_body: pl.message,
            template_used: 'autopilot',
          })

          await supabase
            .from('leads')
            .update({
              status: 'contactado',
              last_contacted_at: new Date().toISOString(),
            })
            .eq('id', pl.lead_id)

          await supabase.from('lead_activity').insert({
            lead_id: pl.lead_id,
            action: 'contactado',
            detail: 'Mensaje enviado por WhatsApp (autopilot)',
          })

          await updatePipelineLead(pl.id, { status: 'sent' })
          sentCount++
          await updateRun({ messages_sent: sentCount })
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'Error al enviar'
          await updatePipelineLead(pl.id, { status: 'error', error: errMsg })
        }

        // Anti-ban delay (4s between messages)
        if (i < toSend.length - 1) {
          await new Promise((r) => setTimeout(r, 4000))
        }
      }

      sock.end(undefined)
    } catch (err) {
      if (sock) sock.end(undefined)
      const errMsg = err instanceof Error ? err.message : 'Error de conexión WhatsApp'
      console.error('[pipeline/stages] WhatsApp error:', errMsg)
      for (const pl of toSend) {
        if (pl.status === 'message_ready' || pl.status === 'sending') {
          await updatePipelineLead(pl.id, { status: 'error', error: errMsg })
        }
      }
    }
  }

  await advanceOrComplete(runId, 'send', config, fromPhase)
}
