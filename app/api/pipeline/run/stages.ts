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
  whatsappAccountId?: string
}

interface PipelineRunErrorLog {
  at: string
  stage: string
  step: string
  error: string
  leadId?: string | null
  businessName?: string | null
  code?: string
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
  let lastStatus: number | null = null
  let lastResponseSnippet = ''
  let loopDetected = false

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
      if (res.ok) return
      const responseText = await res.text().catch(() => '')
      lastStatus = res.status
      lastResponseSnippet = responseText.slice(0, 240)
      loopDetected =
        res.status === 508 ||
        /INFINITE_LOOP_DETECTED/i.test(responseText) ||
        /INFINITE_LOOP_DETECTED/i.test(lastResponseSnippet)
      console.error(
        `[triggerNextStage] Attempt ${attempt + 1} failed: ${res.status}${lastResponseSnippet ? ` — ${lastResponseSnippet}` : ''}`
      )
      if (loopDetected) break
    } catch (err) {
      console.error(`[triggerNextStage] Attempt ${attempt + 1} error:`, err)
    }
    if (attempt < 2 && !loopDetected) {
      const delayMs = [2000, 5000][attempt] ?? 10000
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }

  if (loopDetected) {
    console.warn(
      `[triggerNextStage] INFINITE_LOOP_DETECTED while triggering "${stage}". Falling back to in-process continuation.`
    )
    await processStage(runId, stage, nextPhase)
    return
  }

  throw new Error(
    `Failed to trigger stage "${stage}" after 3 attempts${lastStatus ? ` (last status ${lastStatus})` : ''}${lastResponseSnippet ? `: ${lastResponseSnippet}` : ''}`
  )
}

function getNextStage(current: string, config: PipelineConfig): string | null {
  // After import, all remaining stages are handled by process_leads in parallel
  if (current === 'import') {
    const hasWork =
      !config.skipAnalysis ||
      !config.skipSiteGeneration ||
      !config.skipMessages ||
      !config.skipSending
    return hasWork ? 'process_leads' : null
  }

  // Legacy sequential order (for backward-compat with old runs)
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

function toErrorMessage(err: unknown, fallback = 'Error desconocido'): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return fallback
}

async function appendPipelineRunError(
  runId: string,
  entry: Omit<PipelineRunErrorLog, 'at'>
): Promise<void> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('pipeline_runs')
    .select('errors')
    .eq('id', runId)
    .single()

  const currentErrors = Array.isArray(data?.errors) ? data.errors : []
  const nextErrors = [...currentErrors, { ...entry, at: new Date().toISOString() }].slice(-80)

  await supabase
    .from('pipeline_runs')
    .update({
      errors: nextErrors,
      updated_at: new Date().toISOString(),
    })
    .eq('id', runId)
}

function createRunHelpers(runId: string, stage: string) {
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

  const reportError = async (payload: {
    step: string
    error: string
    leadId?: string | null
    businessName?: string | null
    code?: string
    cause?: unknown
  }) => {
    const { step, error, leadId, businessName, code, cause } = payload
    const logPrefix =
      `[pipeline/error] run=${runId} stage=${stage} step=${step}` +
      (leadId ? ` lead=${leadId}` : '') +
      (businessName ? ` business="${businessName}"` : '') +
      (code ? ` code=${code}` : '')

    if (cause) {
      console.error(`${logPrefix} :: ${error}`, cause)
    } else {
      console.error(`${logPrefix} :: ${error}`)
    }

    try {
      await appendPipelineRunError(runId, {
        stage,
        step,
        error,
        leadId,
        businessName,
        code,
      })
    } catch (appendErr) {
      console.error('[pipeline/error] Failed to append pipeline run error log', appendErr)
    }
  }

  return { supabase, updateRun, updatePipelineLead, isCancelled, reportError }
}

// ─── Stage dispatcher ───────────────────────────────────────────────────────────

export async function processStage(runId: string, stage: string, fromPhase: 'a' | 'b' | 'init' = 'init') {
  const supabase = createServiceClient()

  // Fetch config from the pipeline_runs row
  const { data: run } = await supabase
    .from('pipeline_runs')
    .select('config, status, user_id, whatsapp_account_id')
    .eq('id', runId)
    .single()

  if (!run || run.status === 'cancelled') return

  const config = run.config as PipelineConfig
  // Attach whatsapp_account_id from the run row to config for use in send stages
  if (run.whatsapp_account_id) {
    config.whatsappAccountId = run.whatsapp_account_id
  }
  // Store user_id on config for propagation to lead inserts
  const runUserId = run.user_id as string | undefined

  const t0 = Date.now()
  console.log(`[pipeline/stages] ${stage} DISPATCH START run=${runId}`)

  try {
    switch (stage) {
      case 'search':
        await stageSearch(runId, config, fromPhase, runUserId)
        break
      case 'import':
        await stageImport(runId, config, fromPhase, runUserId)
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
      case 'process_leads':
        await stageProcessLeads(runId, config)
        break
      default:
        console.error(`[pipeline/stages] Unknown stage: ${stage}`)
        await appendPipelineRunError(runId, {
          stage,
          step: 'unknown_stage',
          error: `Unknown stage: ${stage}`,
          code: 'invalid_stage',
        }).catch((appendErr) =>
          console.error('[pipeline/error] Failed to append unknown stage error', appendErr)
        )
    }
  } catch (err) {
    const errMsg = toErrorMessage(err)

    if (isAnthropicRateLimitError(err)) {
      console.warn(`[pipeline/stages] ${stage} RATE_LIMIT run=${runId} elapsed=${Date.now() - t0}ms`)
      await appendPipelineRunError(runId, {
        stage,
        step: 'rate_limit_pause',
        error: errMsg,
        code: 'rate_limit',
      }).catch((appendErr) =>
        console.error('[pipeline/error] Failed to append rate limit error', appendErr)
      )
      await supabase
        .from('pipeline_runs')
        .update({ status: 'running', updated_at: new Date().toISOString() })
        .eq('id', runId)
      return
    }

    console.error(`[pipeline/stages] ${stage} FATAL run=${runId} elapsed=${Date.now() - t0}ms error=${errMsg}`)
    await appendPipelineRunError(runId, {
      stage,
      step: 'stage_fatal',
      error: errMsg,
      code: 'fatal',
    }).catch((appendErr) =>
      console.error('[pipeline/error] Failed to append fatal stage error', appendErr)
    )
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

async function stageSearch(runId: string, config: PipelineConfig, fromPhase: 'a' | 'b' | 'init', userId?: string) {
  const { supabase, updateRun, isCancelled } = createRunHelpers(runId, 'search')

  await updateRun({ stage: 'searching' })
  const t0 = Date.now()
  console.log(`[pipeline/stages] search START run=${runId}`)

  const fetchCount = Math.min(config.maxResults * 2, 60)
  const places = await searchPlaces(config.niche, config.city, fetchCount)

  if (places.length === 0) {
    console.log(`[pipeline/stages] search END run=${runId} elapsed=${Date.now() - t0}ms results=0 (no places)`)
    await updateRun({ status: 'completed', stage: 'done', completed_at: new Date().toISOString() })
    return
  }

  // Check duplicates (scoped to user)
  const placeIds = places.map((p) => p.place_id)
  let dupQuery = supabase.from('leads').select('place_id').in('place_id', placeIds)
  if (userId) dupQuery = dupQuery.eq('user_id', userId)
  const { data: existingLeads } = await dupQuery
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
    console.log(`[pipeline/stages] search END run=${runId} elapsed=${Date.now() - t0}ms results=0 (no viable)`)
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

  console.log(`[pipeline/stages] search END run=${runId} elapsed=${Date.now() - t0}ms viable=${viableResults.length}`)
  await advanceOrComplete(runId, 'search', config, fromPhase)
}

// ─── Stage: Import ──────────────────────────────────────────────────────────────

async function stageImport(runId: string, config: PipelineConfig, fromPhase: 'a' | 'b' | 'init', userId?: string) {
  const { supabase, updateRun, isCancelled } = createRunHelpers(runId, 'import')

  await updateRun({ stage: 'importing' })
  const t0 = Date.now()
  console.log(`[pipeline/stages] import START run=${runId}`)

  // Read search results stored by the search stage
  const { data: run } = await supabase
    .from('pipeline_runs')
    .select('search_results')
    .eq('id', runId)
    .single()

  const viableResults: ScraperResult[] = (run?.search_results as ScraperResult[]) ?? []

  if (viableResults.length === 0) {
    console.log(`[pipeline/stages] import END run=${runId} elapsed=${Date.now() - t0}ms imported=0 (no results)`)
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
    ...(userId ? { user_id: userId } : {}),
  }))

  await supabase
    .from('leads')
    .upsert(toInsert, { onConflict: 'place_id,user_id', ignoreDuplicates: true })

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

  console.log(`[pipeline/stages] import END run=${runId} elapsed=${Date.now() - t0}ms imported=${pLeads.length}`)
  await advanceOrComplete(runId, 'import', config, fromPhase)
}

// ─── Stage: Analyze ─────────────────────────────────────────────────────────────

async function stageAnalyze(runId: string, config: PipelineConfig, fromPhase: 'a' | 'b' | 'init') {
  const { supabase, updateRun, updatePipelineLead, isCancelled, reportError } = createRunHelpers(
    runId,
    'analyze'
  )

  await updateRun({ stage: 'analyzing' })
  const t0 = Date.now()
  console.log(`[pipeline/stages] analyze START run=${runId}`)

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
      await reportError({
        step: 'lead_precheck',
        leadId: pl.lead_id,
        businessName: pl.business_name,
        error: 'Sin website',
        code: 'missing_website',
      })
      return
    }

    await updatePipelineLead(pl.id, { status: 'analyzing' })
    const lt0 = Date.now()

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
      console.log(`[pipeline/stages] analyze lead="${pl.business_name}" elapsed=${Date.now() - lt0}ms score=${score}`)
    } catch (err) {
      console.log(`[pipeline/stages] analyze lead="${pl.business_name}" elapsed=${Date.now() - lt0}ms ERROR`)
      const errMsg = toErrorMessage(err, 'Error al analizar')
      await updatePipelineLead(pl.id, { status: 'error', error: errMsg })
      await reportError({
        step: 'analyze_lead',
        leadId: pl.lead_id,
        businessName: pl.business_name,
        error: errMsg,
        cause: err,
      })
    }
  }

  await pMap(pLeads ?? [], processLead, 5)

  if (cancelled) return

  console.log(`[pipeline/stages] analyze END run=${runId} elapsed=${Date.now() - t0}ms analyzed=${analyzedCount}`)
  await advanceOrComplete(runId, 'analyze', config, fromPhase)
}

// ─── Stage: Generate Sites ──────────────────────────────────────────────────────

async function stageGenerateSites(runId: string, config: PipelineConfig, fromPhase: 'a' | 'b' | 'init') {
  const { supabase, updateRun, updatePipelineLead, isCancelled, reportError } = createRunHelpers(
    runId,
    'generate_sites'
  )

  await updateRun({ stage: 'generating_sites' })
  const t0 = Date.now()
  console.log(`[pipeline/stages] generate_sites START run=${runId}`)

  const { data: allPLeads } = await supabase
    .from('pipeline_leads')
    .select('*')
    .eq('run_id', runId)

  // Reset orphaned leads from a killed previous execution
  const orphaned = (allPLeads ?? []).filter((pl) => pl.status === 'generating_site')
  if (orphaned.length > 0) {
    console.log(`[pipeline/stages] generate_sites reset ${orphaned.length} orphaned leads run=${runId}`)
  }
  for (const pl of orphaned) {
    await updatePipelineLead(pl.id, { status: 'analyzed', error: null })
    pl.status = 'analyzed'
  }

  // Count already-generated sites so the counter stays accurate
  const alreadyGenerated = (allPLeads ?? []).filter(
    (pl) => pl.status === 'site_generated'
  ).length

  // Process all pending leads (no batching needed on Railway — no serverless timeout)
  const pendingLeads = (allPLeads ?? []).filter(
    (pl) => pl.status !== 'site_generated' && pl.status !== 'skipped' && pl.status !== 'error'
  )

  let sitesCount = alreadyGenerated
  let cancelled = false

  const processLead = async (pl: (typeof allPLeads extends (infer T)[] | null ? T : never)) => {
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
    // Heartbeat: refresh updated_at so the stale-run detector doesn't kill us
    await updateRun({})
    const lt0 = Date.now()

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
        await reportError({
          step: 'fetch_lead',
          leadId: pl.lead_id,
          businessName: pl.business_name,
          error: 'Lead no encontrado',
          code: 'lead_not_found',
        })
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
            detectedColors: (existingDetails.detected_colors as string[]) ?? [],
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
      console.log(`[pipeline/stages] generate_sites lead="${pl.business_name}" elapsed=${Date.now() - lt0}ms`)
    } catch (err) {
      if (isAnthropicRateLimitError(err)) {
        await updatePipelineLead(pl.id, {
          status: 'pending',
          error: 'Rate limit de IA. Reintentando automáticamente.',
        })
        await reportError({
          step: 'generate_site',
          leadId: pl.lead_id,
          businessName: pl.business_name,
          error: toErrorMessage(err, 'Rate limit de IA'),
          code: 'rate_limit',
          cause: err,
        })
        throw err
      }
      console.log(`[pipeline/stages] generate_sites lead="${pl.business_name}" elapsed=${Date.now() - lt0}ms ERROR`)
      const errMsg = toErrorMessage(err, 'Error generando sitio')
      await updatePipelineLead(pl.id, { status: 'error', error: errMsg })
      await reportError({
        step: 'generate_site',
        leadId: pl.lead_id,
        businessName: pl.business_name,
        error: errMsg,
        cause: err,
      })
    }
  }

  await pMap(pendingLeads, processLead, 1)

  if (cancelled) return

  console.log(`[pipeline/stages] generate_sites END run=${runId} elapsed=${Date.now() - t0}ms sites=${sitesCount}`)
  await advanceOrComplete(runId, 'generate_sites', config, fromPhase)
}

// ─── Stage: Generate Messages ───────────────────────────────────────────────────

async function stageGenerateMessages(runId: string, config: PipelineConfig, fromPhase: 'a' | 'b' | 'init') {
  const { supabase, updateRun, updatePipelineLead, isCancelled, reportError } = createRunHelpers(
    runId,
    'generate_messages'
  )

  await updateRun({ stage: 'generating_messages' })
  const t0 = Date.now()
  console.log(`[pipeline/stages] generate_messages START run=${runId}`)

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
    const lt0 = Date.now()

    try {
      const { data: lead } = await supabase
        .from('leads')
        .select('*')
        .eq('id', pl.lead_id)
        .single()

      if (!lead) {
        await updatePipelineLead(pl.id, { status: 'error', error: 'Lead no encontrado' })
        await reportError({
          step: 'fetch_lead',
          leadId: pl.lead_id,
          businessName: pl.business_name,
          error: 'Lead no encontrado',
          code: 'lead_not_found',
        })
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
      console.log(`[pipeline/stages] generate_messages lead="${pl.business_name}" elapsed=${Date.now() - lt0}ms`)
    } catch (err) {
      if (isAnthropicRateLimitError(err)) {
        await updatePipelineLead(pl.id, {
          status: 'pending',
          error: 'Rate limit de IA. Reintentando automáticamente.',
        })
        await reportError({
          step: 'generate_message',
          leadId: pl.lead_id,
          businessName: pl.business_name,
          error: toErrorMessage(err, 'Rate limit de IA'),
          code: 'rate_limit',
          cause: err,
        })
        throw err
      }
      console.log(`[pipeline/stages] generate_messages lead="${pl.business_name}" elapsed=${Date.now() - lt0}ms ERROR`)
      const errMsg = toErrorMessage(err, 'Error generando mensaje')
      await updatePipelineLead(pl.id, { status: 'error', error: errMsg })
      await reportError({
        step: 'generate_message',
        leadId: pl.lead_id,
        businessName: pl.business_name,
        error: errMsg,
        cause: err,
      })
    }
  }

  await pMap(freshPLeads ?? [], processLead, 1)

  if (cancelled) return

  await updateRun({ messages_sent: messagesCount })

  console.log(`[pipeline/stages] generate_messages END run=${runId} elapsed=${Date.now() - t0}ms messages=${messagesCount}`)
  await advanceOrComplete(runId, 'generate_messages', config, fromPhase)
}

// ─── Stage: Send ────────────────────────────────────────────────────────────────

async function stageSend(runId: string, config: PipelineConfig, fromPhase: 'a' | 'b' | 'init') {
  const { supabase, updateRun, updatePipelineLead, isCancelled, reportError } = createRunHelpers(
    runId,
    'send'
  )

  await updateRun({ stage: 'sending' })
  const t0 = Date.now()
  console.log(`[pipeline/stages] send START run=${runId}`)

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
      const socketResult = await createWhatsAppSocket(config.whatsappAccountId)
      sock = socketResult.sock
      await waitForConnection(sock, 15000)

      for (let i = 0; i < toSend.length; i++) {
        if (await isCancelled()) {
          sock.end(undefined)
          return
        }

        const pl = toSend[i]
        await updatePipelineLead(pl.id, { status: 'sending' })
        const mt0 = Date.now()

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
          console.log(`[pipeline/stages] send lead="${pl.business_name}" elapsed=${Date.now() - mt0}ms`)
        } catch (err) {
          const errMsg = toErrorMessage(err, 'Error al enviar')
          await updatePipelineLead(pl.id, { status: 'error', error: errMsg })
          await reportError({
            step: 'send_message',
            leadId: pl.lead_id,
            businessName: pl.business_name,
            error: errMsg,
            cause: err,
          })
        }

        // Anti-ban delay (4s between messages)
        if (i < toSend.length - 1) {
          await new Promise((r) => setTimeout(r, 4000))
        }
      }

      sock.end(undefined)
    } catch (err) {
      if (sock) sock.end(undefined)
      const errMsg = toErrorMessage(err, 'Error de conexión WhatsApp')
      console.error(`[pipeline/stages] send WhatsApp error run=${runId} elapsed=${Date.now() - t0}ms error=${errMsg}`)
      await reportError({
        step: 'whatsapp_connection',
        error: errMsg,
        code: 'whatsapp_connection',
        cause: err,
      })
      for (const pl of toSend) {
        if (pl.status === 'message_ready' || pl.status === 'sending') {
          await updatePipelineLead(pl.id, { status: 'error', error: errMsg })
        }
      }
    }
  }

  console.log(`[pipeline/stages] send END run=${runId} elapsed=${Date.now() - t0}ms sent=${sentCount}`)
  await advanceOrComplete(runId, 'send', config, fromPhase)
}

// ─── SendQueue (shared WhatsApp socket for parallel pipeline) ────────────────

class SendQueue {
  private queue: Array<{
    pl: Record<string, unknown>
    resolve: () => void
    reject: (err: unknown) => void
  }> = []
  private sock: Awaited<ReturnType<typeof createWhatsAppSocket>>['sock'] | null = null
  private draining = false
  private connectionError: unknown = null
  private connected = false
  private runHelpers: ReturnType<typeof createRunHelpers>
  private accountId?: string

  constructor(runHelpers: ReturnType<typeof createRunHelpers>, accountId?: string) {
    this.runHelpers = runHelpers
    this.accountId = accountId
  }

  async enqueue(pl: Record<string, unknown>): Promise<void> {
    if (this.connectionError) throw this.connectionError

    // Lazily connect on first enqueue
    if (!this.sock && !this.connected) {
      try {
        const socketResult = await createWhatsAppSocket(this.accountId)
        this.sock = socketResult.sock
        await waitForConnection(this.sock, 15000)
        this.connected = true
      } catch (err) {
        this.connectionError = err
        throw err
      }
    }

    return new Promise<void>((resolve, reject) => {
      this.queue.push({ pl, resolve, reject })
      this.drain()
    })
  }

  private async drain(): Promise<void> {
    if (this.draining) return
    this.draining = true

    while (this.queue.length > 0) {
      const item = this.queue.shift()!
      const { pl, resolve, reject } = item

      try {
        await this.runHelpers.updatePipelineLead(pl.id as string, { status: 'sending' })
        const mt0 = Date.now()

        const jid = formatPhoneToJid(pl.phone as string)
        await this.sock!.sendMessage(jid, { text: pl.message as string })

        await this.runHelpers.supabase.from('messages').insert({
          lead_id: pl.lead_id,
          channel: 'whatsapp',
          message_body: pl.message,
          template_used: 'autopilot',
        })

        await this.runHelpers.supabase
          .from('leads')
          .update({
            status: 'contactado',
            last_contacted_at: new Date().toISOString(),
          })
          .eq('id', pl.lead_id)

        await this.runHelpers.supabase.from('lead_activity').insert({
          lead_id: pl.lead_id,
          action: 'contactado',
          detail: 'Mensaje enviado por WhatsApp (autopilot)',
        })

        await this.runHelpers.updatePipelineLead(pl.id as string, { status: 'sent' })
        console.log(`[pipeline/stages] send lead="${pl.business_name}" elapsed=${Date.now() - mt0}ms`)
        resolve()
      } catch (err) {
        const errMsg = toErrorMessage(err, 'Error al enviar')
        await this.runHelpers.updatePipelineLead(pl.id as string, { status: 'error', error: errMsg })
        await this.runHelpers.reportError({
          step: 'send_message',
          leadId: pl.lead_id as string,
          businessName: pl.business_name as string,
          error: errMsg,
          cause: err,
        })
        reject(err)
      }

      // Anti-ban delay (4s between messages)
      if (this.queue.length > 0) {
        await new Promise((r) => setTimeout(r, 4000))
      }
    }

    this.draining = false
  }

  close(): void {
    if (this.sock) {
      this.sock.end(undefined)
      this.sock = null
    }
    // Reject any remaining queued items
    for (const item of this.queue) {
      item.reject(new Error('SendQueue closed'))
    }
    this.queue = []
  }
}

// ─── Stage: Process Leads (parallel per-lead pipeline) ──────────────────────

async function processOneLead(
  runId: string,
  pl: Record<string, unknown>,
  config: PipelineConfig,
  counters: { analyzed: number; sitesGenerated: number; messagesGenerated: number; sent: number },
  helpers: ReturnType<typeof createRunHelpers>,
  sendQueue: SendQueue
): Promise<void> {
  const { supabase, updateRun, updatePipelineLead, isCancelled, reportError } = helpers

  if (pl.status === 'skipped' || pl.status === 'sent') return

  // ── Step 1: Analyze ──
  if (!config.skipAnalysis && (pl.status === 'pending')) {
    if (await isCancelled()) return

    const dbLeadRes = await supabase
      .from('leads')
      .select('id, business_name, phone, website, status, place_id')
      .eq('id', pl.lead_id)
      .single()
    const dbLead = dbLeadRes.data

    if (!dbLead?.website) {
      await updatePipelineLead(pl.id as string, { status: 'error', error: 'Sin website' })
      await reportError({
        step: 'lead_precheck',
        leadId: pl.lead_id as string,
        businessName: pl.business_name as string,
        error: 'Sin website',
        code: 'missing_website',
      })
      return
    }

    await updatePipelineLead(pl.id as string, { status: 'analyzing' })
    const lt0 = Date.now()

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

      await updatePipelineLead(pl.id as string, { status: 'analyzed', score })
      pl.status = 'analyzed'
      pl.score = score
      counters.analyzed++
      await updateRun({ analyzed: counters.analyzed })
      console.log(`[pipeline/stages] process lead="${pl.business_name}" analyze elapsed=${Date.now() - lt0}ms score=${score}`)
    } catch (err) {
      console.log(`[pipeline/stages] process lead="${pl.business_name}" analyze elapsed=${Date.now() - lt0}ms ERROR`)
      const errMsg = toErrorMessage(err, 'Error al analizar')
      await updatePipelineLead(pl.id as string, { status: 'error', error: errMsg })
      await reportError({
        step: 'analyze_lead',
        leadId: pl.lead_id as string,
        businessName: pl.business_name as string,
        error: errMsg,
        cause: err,
      })
      return
    }
  }

  // ── Step 2: Generate Site ──
  if (
    !config.skipSiteGeneration &&
    ['analyzed', 'pending'].includes(pl.status as string)
  ) {
    if (await isCancelled()) return

    // Skip high-score leads
    if (pl.score && (pl.score as number) >= 6) {
      await updatePipelineLead(pl.id as string, { status: 'skipped' })
      return
    }

    await updatePipelineLead(pl.id as string, { status: 'generating_site', error: null })
    await updateRun({}) // heartbeat
    const lt0 = Date.now()

    try {
      const { data: lead } = await supabase
        .from('leads')
        .select(
          'id, business_name, category, niche, address, phone, website, place_id, rating, google_photo_url, score_details'
        )
        .eq('id', pl.lead_id)
        .single()

      if (!lead) {
        await updatePipelineLead(pl.id as string, { status: 'error', error: 'Lead no encontrado' })
        await reportError({
          step: 'fetch_lead',
          leadId: pl.lead_id as string,
          businessName: pl.business_name as string,
          error: 'Lead no encontrado',
          code: 'lead_not_found',
        })
        return
      }

      const existingDetails = (lead.score_details ?? {}) as Record<string, unknown>
      const rawLogoUrl = (existingDetails.logo_url as string | null) ?? null
      const rawImages = (existingDetails.scraped_images as string[]) ?? []

      const ICON_URL_KEYWORDS = [
        'logo', 'icon', 'favicon', 'sprite', 'whatsapp', 'facebook',
        'instagram', 'twitter', 'badge', 'btn', 'arrow', 'close', 'menu',
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
            detectedColors: (existingDetails.detected_colors as string[]) ?? [],
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

      await updatePipelineLead(pl.id as string, { status: 'site_generated', site_url: previewUrl })
      pl.status = 'site_generated'
      counters.sitesGenerated++
      await updateRun({ sites_generated: counters.sitesGenerated })
      console.log(`[pipeline/stages] process lead="${pl.business_name}" generate_site elapsed=${Date.now() - lt0}ms`)
    } catch (err) {
      console.log(`[pipeline/stages] process lead="${pl.business_name}" generate_site elapsed=${Date.now() - lt0}ms ERROR`)
      const errMsg = toErrorMessage(err, 'Error generando sitio')
      await updatePipelineLead(pl.id as string, { status: 'error', error: errMsg })
      await reportError({
        step: 'generate_site',
        leadId: pl.lead_id as string,
        businessName: pl.business_name as string,
        error: errMsg,
        cause: err,
      })
      return
    }
  }

  // ── Step 3: Generate Message ──
  if (
    !config.skipMessages &&
    ['site_generated', 'analyzed', 'pending'].includes(pl.status as string)
  ) {
    if (await isCancelled()) return
    if (!(pl.phone as string)) return

    await updatePipelineLead(pl.id as string, { status: 'generating_message', error: null })
    const lt0 = Date.now()

    try {
      const { data: lead } = await supabase
        .from('leads')
        .select('*')
        .eq('id', pl.lead_id)
        .single()

      if (!lead) {
        await updatePipelineLead(pl.id as string, { status: 'error', error: 'Lead no encontrado' })
        await reportError({
          step: 'fetch_lead',
          leadId: pl.lead_id as string,
          businessName: pl.business_name as string,
          error: 'Lead no encontrado',
          code: 'lead_not_found',
        })
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

      await updatePipelineLead(pl.id as string, { status: 'message_ready', message })
      pl.status = 'message_ready'
      pl.message = message
      counters.messagesGenerated++
      console.log(`[pipeline/stages] process lead="${pl.business_name}" generate_message elapsed=${Date.now() - lt0}ms`)
    } catch (err) {
      console.log(`[pipeline/stages] process lead="${pl.business_name}" generate_message elapsed=${Date.now() - lt0}ms ERROR`)
      const errMsg = toErrorMessage(err, 'Error generando mensaje')
      await updatePipelineLead(pl.id as string, { status: 'error', error: errMsg })
      await reportError({
        step: 'generate_message',
        leadId: pl.lead_id as string,
        businessName: pl.business_name as string,
        error: errMsg,
        cause: err,
      })
      return
    }
  }

  // ── Step 4: Send ──
  if (
    !config.skipSending &&
    pl.status === 'message_ready' &&
    pl.message &&
    pl.phone
  ) {
    if (await isCancelled()) return

    try {
      await sendQueue.enqueue(pl)
      pl.status = 'sent'
      counters.sent++
      await updateRun({ messages_sent: counters.sent })
    } catch {
      // Error already handled inside SendQueue
    }
  }
}

async function stageProcessLeads(runId: string, config: PipelineConfig): Promise<void> {
  const helpers = createRunHelpers(runId, 'process_leads')
  const { supabase, updateRun, updatePipelineLead, isCancelled } = helpers

  await updateRun({ stage: 'processing' })
  const t0 = Date.now()
  console.log(`[pipeline/stages] process_leads START run=${runId}`)

  const { data: allPLeads } = await supabase
    .from('pipeline_leads')
    .select('*')
    .eq('run_id', runId)

  const pLeads = allPLeads ?? []

  // Reset orphaned leads stuck in active states from killed runs
  const activeStatuses = ['analyzing', 'generating_site', 'generating_message', 'sending']
  for (const pl of pLeads) {
    if (activeStatuses.includes(pl.status)) {
      let resetStatus = 'pending'
      if (pl.status === 'generating_site') resetStatus = 'analyzed'
      else if (pl.status === 'generating_message') resetStatus = 'site_generated'
      else if (pl.status === 'sending') resetStatus = 'message_ready'
      console.log(`[pipeline/stages] process_leads reset orphaned lead="${pl.business_name}" ${pl.status} → ${resetStatus}`)
      await updatePipelineLead(pl.id, { status: resetStatus, error: null })
      pl.status = resetStatus
    }
  }

  // Initialize counters from already-completed leads
  const counters = {
    analyzed: pLeads.filter((pl) =>
      ['analyzed', 'site_generated', 'generating_site', 'generating_message', 'message_ready', 'sending', 'sent'].includes(pl.status)
    ).length,
    sitesGenerated: pLeads.filter((pl) =>
      ['site_generated', 'generating_message', 'message_ready', 'sending', 'sent'].includes(pl.status)
    ).length,
    messagesGenerated: pLeads.filter((pl) =>
      ['message_ready', 'sending', 'sent'].includes(pl.status)
    ).length,
    sent: pLeads.filter((pl) => pl.status === 'sent').length,
  }
  await updateRun({
    analyzed: counters.analyzed,
    sites_generated: counters.sitesGenerated,
    messages_sent: counters.sent,
  })

  // Filter to leads that still need processing
  const leadsToProcess = pLeads.filter(
    (pl) => pl.status !== 'skipped' && pl.status !== 'sent' && pl.status !== 'error'
  )

  const sendQueue = new SendQueue(helpers, config.whatsappAccountId)

  try {
    await pMap(
      leadsToProcess,
      async (pl) => {
        if (await isCancelled()) return
        await processOneLead(
          runId,
          pl as unknown as Record<string, unknown>,
          config,
          counters,
          helpers,
          sendQueue
        )
      },
      3
    )
  } finally {
    sendQueue.close()
  }

  if (await isCancelled()) return

  // Mark run as completed
  await supabase
    .from('pipeline_runs')
    .update({
      status: 'completed',
      stage: 'done',
      analyzed: counters.analyzed,
      sites_generated: counters.sitesGenerated,
      messages_sent: counters.sent,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', runId)

  console.log(
    `[pipeline/stages] process_leads END run=${runId} elapsed=${Date.now() - t0}ms` +
    ` analyzed=${counters.analyzed} sites=${counters.sitesGenerated} messages=${counters.messagesGenerated} sent=${counters.sent}`
  )
}
