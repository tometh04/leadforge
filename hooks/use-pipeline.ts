'use client'

import { useReducer, useRef, useCallback } from 'react'
import type { PipelineStage, PipelineLeadState, ScraperResult } from '@/types'

interface PipelineConfig {
  niche: string
  city: string
  maxResults: number
  skipAnalysis: boolean
  skipSiteGeneration: boolean
  skipMessages: boolean
  skipSending: boolean
}

interface PipelineState {
  stage: PipelineStage
  leads: PipelineLeadState[]
  runId: string | null
  progress: {
    searched: number
    imported: number
    analyzed: number
    sitesGenerated: number
    messagesGenerated: number
    sent: number
    errors: number
  }
  error: string | null
}

type PipelineAction =
  | { type: 'START'; runId: string }
  | { type: 'SET_STAGE'; stage: PipelineStage }
  | { type: 'SET_LEADS'; leads: PipelineLeadState[] }
  | { type: 'UPDATE_LEAD'; leadId: string; updates: Partial<PipelineLeadState> }
  | { type: 'INCREMENT'; key: keyof PipelineState['progress'] }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'RESET' }

const initialState: PipelineState = {
  stage: 'idle',
  leads: [],
  runId: null,
  progress: {
    searched: 0,
    imported: 0,
    analyzed: 0,
    sitesGenerated: 0,
    messagesGenerated: 0,
    sent: 0,
    errors: 0,
  },
  error: null,
}

function reducer(state: PipelineState, action: PipelineAction): PipelineState {
  switch (action.type) {
    case 'START':
      return { ...initialState, stage: 'searching', runId: action.runId }
    case 'SET_STAGE':
      return { ...state, stage: action.stage }
    case 'SET_LEADS':
      return { ...state, leads: action.leads }
    case 'UPDATE_LEAD':
      return {
        ...state,
        leads: state.leads.map((l) =>
          l.leadId === action.leadId ? { ...l, ...action.updates } : l
        ),
      }
    case 'INCREMENT':
      return {
        ...state,
        progress: { ...state.progress, [action.key]: state.progress[action.key] + 1 },
      }
    case 'SET_ERROR':
      return { ...state, stage: 'error', error: action.error }
    case 'RESET':
      return initialState
    default:
      return state
  }
}

export function usePipeline() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const cancelledRef = useRef(false)

  const updateRun = async (id: string, updates: Record<string, unknown>) => {
    await fetch('/api/pipeline', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    })
  }

  const run = useCallback(async (config: PipelineConfig) => {
    cancelledRef.current = false

    // Crear run en DB
    const runRes = await fetch('/api/pipeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ niche: config.niche, city: config.city }),
    })
    const runData = await runRes.json()
    if (!runRes.ok) throw new Error(runData.error)

    dispatch({ type: 'START', runId: runData.id })

    try {
      // ── 1. SEARCH ──
      const searchRes = await fetch('/api/scraper/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          niche: config.niche,
          city: config.city,
          maxResults: config.maxResults,
        }),
      })
      const searchData = await searchRes.json()
      if (!searchRes.ok) throw new Error(searchData.error)
      if (cancelledRef.current) return

      const results: ScraperResult[] = searchData.results ?? []
      dispatch({
        type: 'SET_LEADS',
        leads: results.map((r) => ({
          leadId: '',
          businessName: r.business_name,
          phone: r.phone,
          status: 'pending' as const,
        })),
      })

      // ── 2. IMPORT ──
      dispatch({ type: 'SET_STAGE', stage: 'importing' })

      const viableLeads = results.filter((r) => !r.already_imported)
      if (viableLeads.length === 0) {
        dispatch({ type: 'SET_STAGE', stage: 'done' })
        await updateRun(runData.id, { status: 'completed', completed_at: new Date().toISOString() })
        return
      }

      const importRes = await fetch('/api/scraper/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leads: viableLeads,
          niche: config.niche,
          city: config.city,
        }),
      })
      const importData = await importRes.json()
      if (!importRes.ok) throw new Error(importData.error)
      if (cancelledRef.current) return

      // Obtener los leads importados con sus IDs
      const leadsRes = await fetch(
        `/api/leads?niche=${encodeURIComponent(config.niche)}&city=${encodeURIComponent(config.city)}&status=nuevo&limit=100`
      )
      const leadsData = await leadsRes.json()
      if (!leadsRes.ok) throw new Error(leadsData.error)

      const importedLeads = leadsData.data ?? leadsData
      const leadStates: PipelineLeadState[] = (Array.isArray(importedLeads) ? importedLeads : []).map(
        (l: { id: string; business_name: string; phone: string; website: string; status: string }) => ({
          leadId: l.id,
          businessName: l.business_name,
          phone: l.phone || '',
          status: l.status === 'contactado' ? 'skipped' as const : 'pending' as const,
        })
      )

      dispatch({ type: 'SET_LEADS', leads: leadStates })
      await updateRun(runData.id, { total_leads: leadStates.length })

      // ── 3. ANALYZE ──
      if (!config.skipAnalysis) {
        dispatch({ type: 'SET_STAGE', stage: 'analyzing' })

        for (const lead of leadStates) {
          if (cancelledRef.current) return
          if (lead.status === 'skipped') continue

          dispatch({ type: 'UPDATE_LEAD', leadId: lead.leadId, updates: { status: 'analyzing' } })

          try {
            const res = await fetch(`/api/analyze/${lead.leadId}`, { method: 'POST' })
            const data = await res.json()

            if (res.ok) {
              lead.score = data.score
              dispatch({
                type: 'UPDATE_LEAD',
                leadId: lead.leadId,
                updates: { status: 'analyzed', score: data.score },
              })
              dispatch({ type: 'INCREMENT', key: 'analyzed' })
            } else {
              dispatch({
                type: 'UPDATE_LEAD',
                leadId: lead.leadId,
                updates: { status: 'analyzed' },
              })
            }
          } catch {
            dispatch({
              type: 'UPDATE_LEAD',
              leadId: lead.leadId,
              updates: { status: 'analyzed' },
            })
          }
        }

        await updateRun(runData.id, { analyzed: leadStates.filter((l) => l.score).length })
      }

      // ── 4. GENERATE SITES ──
      if (!config.skipSiteGeneration) {
        dispatch({ type: 'SET_STAGE', stage: 'generating_sites' })

        for (const lead of leadStates) {
          if (cancelledRef.current) return
          if (lead.status === 'skipped') continue
          // Skip si score >= 6 (sitio actual es decente)
          if (lead.score && lead.score >= 6) {
            dispatch({
              type: 'UPDATE_LEAD',
              leadId: lead.leadId,
              updates: { status: 'skipped' },
            })
            continue
          }

          dispatch({
            type: 'UPDATE_LEAD',
            leadId: lead.leadId,
            updates: { status: 'generating_site' },
          })

          try {
            const res = await fetch(`/api/generate-site/${lead.leadId}`, { method: 'POST' })
            const data = await res.json()

            if (res.ok) {
              lead.siteUrl = data.url || data.siteUrl
              dispatch({
                type: 'UPDATE_LEAD',
                leadId: lead.leadId,
                updates: { status: 'site_generated', siteUrl: lead.siteUrl },
              })
              dispatch({ type: 'INCREMENT', key: 'sitesGenerated' })
            } else {
              dispatch({
                type: 'UPDATE_LEAD',
                leadId: lead.leadId,
                updates: { status: 'error', error: data.error },
              })
              dispatch({ type: 'INCREMENT', key: 'errors' })
            }
          } catch (err) {
            dispatch({
              type: 'UPDATE_LEAD',
              leadId: lead.leadId,
              updates: { status: 'error', error: err instanceof Error ? err.message : 'Error' },
            })
            dispatch({ type: 'INCREMENT', key: 'errors' })
          }
        }

        await updateRun(runData.id, {
          sites_generated: leadStates.filter((l) => l.siteUrl).length,
        })
      }

      // ── 5. GENERATE MESSAGES ──
      if (!config.skipMessages) {
        dispatch({ type: 'SET_STAGE', stage: 'generating_messages' })

        for (const lead of leadStates) {
          if (cancelledRef.current) return
          if (!lead.phone) continue
          if (lead.status === 'skipped' || lead.status === 'error') continue

          dispatch({
            type: 'UPDATE_LEAD',
            leadId: lead.leadId,
            updates: { status: 'generating_message' },
          })

          try {
            const res = await fetch(`/api/outreach/generate-message/${lead.leadId}`, {
              method: 'POST',
            })
            const data = await res.json()

            if (res.ok) {
              lead.message = data.message
              dispatch({
                type: 'UPDATE_LEAD',
                leadId: lead.leadId,
                updates: { status: 'message_ready', message: data.message },
              })
              dispatch({ type: 'INCREMENT', key: 'messagesGenerated' })
            } else {
              dispatch({
                type: 'UPDATE_LEAD',
                leadId: lead.leadId,
                updates: { status: 'error', error: data.error },
              })
              dispatch({ type: 'INCREMENT', key: 'errors' })
            }
          } catch (err) {
            dispatch({
              type: 'UPDATE_LEAD',
              leadId: lead.leadId,
              updates: { status: 'error', error: err instanceof Error ? err.message : 'Error' },
            })
            dispatch({ type: 'INCREMENT', key: 'errors' })
          }
        }
      }

      // ── 6. SEND VIA WHATSAPP ──
      if (!config.skipSending) {
        dispatch({ type: 'SET_STAGE', stage: 'sending' })

        const toSend = leadStates
          .filter((l) => l.message && l.phone && l.status === 'message_ready')
          .map((l) => ({ leadId: l.leadId, phone: l.phone, message: l.message! }))

        if (toSend.length > 0) {
          // Enviar en batches de 10
          for (let i = 0; i < toSend.length; i += 10) {
            if (cancelledRef.current) return
            const batch = toSend.slice(i, i + 10)

            await new Promise<void>((resolve, reject) => {
              const response = fetch('/api/whatsapp/send-batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ leads: batch }),
              })

              response
                .then(async (res) => {
                  const reader = res.body?.getReader()
                  if (!reader) {
                    reject(new Error('No stream'))
                    return
                  }

                  const decoder = new TextDecoder()
                  let buffer = ''

                  while (true) {
                    const { done, value } = await reader.read()
                    if (done) break

                    buffer += decoder.decode(value, { stream: true })
                    const lines = buffer.split('\n')
                    buffer = lines.pop() || ''

                    for (const line of lines) {
                      if (!line.startsWith('data: ')) continue
                      const data = JSON.parse(line.slice(6))

                      if (data.type === 'sent') {
                        dispatch({
                          type: 'UPDATE_LEAD',
                          leadId: data.leadId,
                          updates: { status: 'sent' },
                        })
                        dispatch({ type: 'INCREMENT', key: 'sent' })
                      } else if (data.type === 'error') {
                        dispatch({
                          type: 'UPDATE_LEAD',
                          leadId: data.leadId,
                          updates: { status: 'error', error: data.error },
                        })
                        dispatch({ type: 'INCREMENT', key: 'errors' })
                      } else if (data.type === 'fatal') {
                        reject(new Error(data.error))
                        return
                      }
                    }
                  }

                  resolve()
                })
                .catch(reject)
            })
          }
        }

        await updateRun(runData.id, {
          messages_sent: leadStates.filter((l) => l.status === 'sent').length,
        })
      }

      // ── DONE ──
      dispatch({ type: 'SET_STAGE', stage: 'done' })
      await updateRun(runData.id, {
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error desconocido'
      dispatch({ type: 'SET_ERROR', error: errorMsg })
      if (runData.id) {
        await updateRun(runData.id, { status: 'failed' })
      }
    }
  }, [])

  const cancel = useCallback(() => {
    cancelledRef.current = true
    dispatch({ type: 'SET_STAGE', stage: 'done' })
    if (state.runId) {
      updateRun(state.runId, { status: 'cancelled' })
    }
  }, [state.runId])

  return {
    state,
    run,
    cancel,
    isRunning: !['idle', 'done', 'error'].includes(state.stage),
    reset: () => dispatch({ type: 'RESET' }),
  }
}
