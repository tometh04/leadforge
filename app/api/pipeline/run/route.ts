import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { searchPlaces, fetchPlaceDetails } from '@/lib/google-places/client'
import { quickLeadFilter, analyzeWebsite } from '@/lib/claude/scoring'
import { scrapeSite } from '@/lib/scraper/site-scraper'
import { generateSiteHTML, slugify, ScrapedBusinessData } from '@/lib/claude/site-generator'
import { generateWhatsAppMessage, buildDefaultMessage } from '@/lib/claude/outreach'
import { createWhatsAppSocket, waitForConnection, formatPhoneToJid } from '@/lib/whatsapp/client'
import type { ScraperResult } from '@/types'

export const maxDuration = 300

interface PipelineConfig {
  niche: string
  city: string
  maxResults: number
  skipAnalysis: boolean
  skipSiteGeneration: boolean
  skipMessages: boolean
  skipSending: boolean
}

export async function POST(req: NextRequest) {
  try {
    const config: PipelineConfig = await req.json()

    if (!config.niche || !config.city) {
      return NextResponse.json({ error: 'niche y city son requeridos' }, { status: 400 })
    }

    // Create run in DB (uses cookie-based client since we're still in request context)
    const supabase = await createClient()
    const { data: run, error } = await supabase
      .from('pipeline_runs')
      .insert({
        niche: config.niche,
        city: config.city,
        status: 'running',
        stage: 'searching',
        config,
      })
      .select()
      .single()

    if (error || !run) {
      return NextResponse.json({ error: error?.message ?? 'Error creando run' }, { status: 500 })
    }

    // Fire-and-forget: process pipeline after response is sent
    after(async () => {
      await processPipeline(run.id, config)
    })

    return NextResponse.json({ id: run.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ─── Background processing ───────────────────────────────────────────────────

async function processPipeline(runId: string, config: PipelineConfig) {
  // Use cookie-free client for background processing
  const supabase = createServiceClient()

  const updateRun = async (updates: Record<string, unknown>) => {
    await supabase.from('pipeline_runs').update(updates).eq('id', runId)
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

  try {
    // ── 1. SEARCH ──────────────────────────────────────────────────────────
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

    const viableResults: ScraperResult[] = places.filter((p) => {
      if (existingIds.has(p.place_id)) return false
      return viabilityMap.get(p.place_id) !== false
    }).slice(0, config.maxResults)

    if (viableResults.length === 0) {
      await updateRun({ status: 'completed', stage: 'done', completed_at: new Date().toISOString() })
      return
    }

    if (await isCancelled()) return

    // ── 2. IMPORT ──────────────────────────────────────────────────────────
    await updateRun({ stage: 'importing' })

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
      .in('place_id', viableResults.map((r) => r.place_id))

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

    // ── 3. ANALYZE ─────────────────────────────────────────────────────────
    if (!config.skipAnalysis) {
      await updateRun({ stage: 'analyzing' })
      let analyzedCount = 0

      for (const pl of pLeads) {
        if (await isCancelled()) return
        if (pl.status === 'skipped') continue

        const dbLead = dbLeads.find((l) => l.id === pl.lead_id)
        if (!dbLead?.website) {
          await updatePipelineLead(pl.id, { status: 'error', error: 'Sin website' })
          continue
        }

        await updatePipelineLead(pl.id, { status: 'analyzing' })

        try {
          const scraped = await scrapeSite(dbLead.website)
          const { score, details } = await analyzeWebsite(dbLead.website, scraped)
          const newStatus = score < 6 ? 'candidato' : 'analizado'

          // Update leads table
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
    }

    if (await isCancelled()) return

    // ── 4. GENERATE SITES ──────────────────────────────────────────────────
    if (!config.skipSiteGeneration) {
      await updateRun({ stage: 'generating_sites' })
      let sitesCount = 0

      // Refetch pipeline leads to get updated scores
      const { data: freshPLeads } = await supabase
        .from('pipeline_leads')
        .select('*')
        .eq('run_id', runId)

      for (const pl of freshPLeads ?? []) {
        if (await isCancelled()) return
        if (pl.status === 'skipped' || pl.status === 'error') continue
        // Skip if score >= 6 (decent site)
        if (pl.score && pl.score >= 6) {
          await updatePipelineLead(pl.id, { status: 'skipped' })
          continue
        }

        await updatePipelineLead(pl.id, { status: 'generating_site' })

        try {
          // Fetch full lead data for site generation
          const { data: lead } = await supabase
            .from('leads')
            .select('id, business_name, category, niche, address, phone, website, place_id, rating, google_photo_url, score_details')
            .eq('id', pl.lead_id)
            .single()

          if (!lead) {
            await updatePipelineLead(pl.id, { status: 'error', error: 'Lead no encontrado' })
            continue
          }

          // Reconstruct scraped data from score_details
          const existingDetails = (lead.score_details ?? {}) as Record<string, unknown>
          const rawLogoUrl = (existingDetails.logo_url as string | null) ?? null
          const rawImages = (existingDetails.scraped_images as string[]) ?? []

          const ICON_URL_KEYWORDS = ['logo', 'icon', 'favicon', 'sprite', 'whatsapp', 'facebook',
            'instagram', 'twitter', 'badge', 'btn', 'arrow', 'close', 'menu']
          const filteredImages = rawImages.filter((url: string) => {
            const u = url.toLowerCase()
            if (rawLogoUrl && u === rawLogoUrl.toLowerCase()) return false
            if (ICON_URL_KEYWORDS.some(kw => u.includes(kw))) return false
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

          // Fetch place details
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

          // Prepare images
          const allImageUrls: string[] = []
          if (scrapedData?.googlePhotoUrl) allImageUrls.push(scrapedData.googlePhotoUrl)
          if (scrapedData?.imageUrls) {
            for (const url of scrapedData.imageUrls) {
              if (!allImageUrls.includes(url) && url !== rawLogoUrl) {
                allImageUrls.push(url)
              }
            }
          }

          // Generate HTML
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

          // Save to leads table
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
          const errMsg = err instanceof Error ? err.message : 'Error generando sitio'
          await updatePipelineLead(pl.id, { status: 'error', error: errMsg })
        }
      }
    }

    if (await isCancelled()) return

    // ── 5. GENERATE MESSAGES ───────────────────────────────────────────────
    if (!config.skipMessages) {
      await updateRun({ stage: 'generating_messages' })
      let messagesCount = 0

      const { data: freshPLeads } = await supabase
        .from('pipeline_leads')
        .select('*')
        .eq('run_id', runId)

      for (const pl of freshPLeads ?? []) {
        if (await isCancelled()) return
        if (!pl.phone) continue
        if (pl.status === 'skipped' || pl.status === 'error') continue

        await updatePipelineLead(pl.id, { status: 'generating_message' })

        try {
          const { data: lead } = await supabase
            .from('leads')
            .select('*')
            .eq('id', pl.lead_id)
            .single()

          if (!lead) {
            await updatePipelineLead(pl.id, { status: 'error', error: 'Lead no encontrado' })
            continue
          }

          let message: string
          try {
            message = await generateWhatsAppMessage(
              lead.business_name,
              lead.category ?? lead.niche,
              lead.address ?? '',
              lead.generated_site_url
            )
          } catch {
            message = buildDefaultMessage(lead.business_name, lead.generated_site_url)
          }

          await updatePipelineLead(pl.id, { status: 'message_ready', message })
          messagesCount++
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'Error generando mensaje'
          await updatePipelineLead(pl.id, { status: 'error', error: errMsg })
        }
      }

      await updateRun({ messages_sent: messagesCount })
    }

    if (await isCancelled()) return

    // ── 6. SEND VIA WHATSAPP ───────────────────────────────────────────────
    if (!config.skipSending) {
      await updateRun({ stage: 'sending' })
      let sentCount = 0

      const { data: freshPLeads } = await supabase
        .from('pipeline_leads')
        .select('*')
        .eq('run_id', runId)

      const toSend = (freshPLeads ?? []).filter(
        (pl) => pl.message && pl.phone && pl.status === 'message_ready'
      )

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

              // Record in DB
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
          console.error('[pipeline/run] WhatsApp error:', errMsg)
          // Mark remaining as error
          for (const pl of toSend) {
            if (pl.status === 'message_ready' || pl.status === 'sending') {
              await updatePipelineLead(pl.id, { status: 'error', error: errMsg })
            }
          }
        }
      }
    }

    // ── DONE ───────────────────────────────────────────────────────────────
    await updateRun({
      status: 'completed',
      stage: 'done',
      completed_at: new Date().toISOString(),
    })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Error desconocido'
    console.error('[pipeline/run] Fatal error:', errMsg)
    await supabase
      .from('pipeline_runs')
      .update({ status: 'failed', stage: 'error' })
      .eq('id', runId)
  }
}
