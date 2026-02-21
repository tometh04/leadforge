'use client'

import { useReducer, useRef, useCallback, useEffect } from 'react'
import type { PipelineStage, PipelineLeadState, PipelineLeadRow, PipelineRun } from '@/types'

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
  runErrors: PipelineRun['errors']
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
  resuming: boolean
}

type PipelineAction =
  | { type: 'START'; runId: string }
  | { type: 'SET_STAGE'; stage: PipelineStage }
  | { type: 'SET_LEADS'; leads: PipelineLeadState[] }
  | {
      type: 'SYNC'
      stage: PipelineStage
      leads: PipelineLeadState[]
      runErrors: PipelineRun['errors']
      progress: PipelineState['progress']
    }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'DONE'; stage: PipelineStage }
  | { type: 'RESUMING'; runId: string }
  | { type: 'RESET' }

const initialState: PipelineState = {
  stage: 'idle',
  leads: [],
  runErrors: [],
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
  resuming: false,
}

function reducer(state: PipelineState, action: PipelineAction): PipelineState {
  switch (action.type) {
    case 'START':
      return { ...initialState, stage: 'searching', runId: action.runId }
    case 'SET_STAGE':
      return { ...state, stage: action.stage }
    case 'SET_LEADS':
      return { ...state, leads: action.leads }
    case 'SYNC':
      return {
        ...state,
        stage: action.stage,
        leads: action.leads,
        runErrors: action.runErrors,
        progress: action.progress,
        resuming: false,
      }
    case 'SET_ERROR':
      return { ...state, stage: 'error', error: action.error, resuming: false }
    case 'DONE':
      return { ...state, stage: action.stage, resuming: false }
    case 'RESUMING':
      return { ...state, resuming: true, runId: action.runId, stage: 'searching' }
    case 'RESET':
      return initialState
    default:
      return state
  }
}

/** Map DB pipeline_lead row to UI PipelineLeadState */
function dbLeadToState(row: PipelineLeadRow): PipelineLeadState {
  return {
    leadId: row.lead_id ?? row.id,
    businessName: row.business_name,
    phone: row.phone,
    status: row.status,
    score: row.score ?? undefined,
    siteUrl: row.site_url ?? undefined,
    message: row.message ?? undefined,
    error: row.error ?? undefined,
  }
}

const POLL_INTERVAL = 3000

export function usePipeline() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const stateRef = useRef(state)
  stateRef.current = state
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }, [])

  const poll = useCallback(async (runId: string) => {
    try {
      const [runRes, leadsRes] = await Promise.all([
        fetch('/api/pipeline'),
        fetch(`/api/pipeline/leads?runId=${runId}`),
      ])

      if (!runRes.ok || !leadsRes.ok) return

      const runs = await runRes.json()
      const { leads: dbLeads } = await leadsRes.json()

      const run = (runs as Array<{ id: string }>).find((r) => r.id === runId) as
        | (Record<string, unknown> & { id: string; stage: string; status: string })
        | undefined

      if (!run) return

      const prevLeads = stateRef.current.leads
      const leadStates: PipelineLeadState[] = (dbLeads ?? []).map((row: PipelineLeadRow) => {
        const mapped = dbLeadToState(row)
        const prev = prevLeads.find((p) => p.leadId === mapped.leadId)
        mapped.updatedAt =
          prev && prev.status === mapped.status ? prev.updatedAt : Date.now()
        return mapped
      })

      const errorCount = leadStates.filter((l) => l.status === 'error').length
      const analyzedCount = leadStates.filter((l) =>
        ['analyzed', 'generating_site', 'site_generated', 'generating_message', 'message_ready', 'sending', 'sent'].includes(l.status)
      ).length
      const sitesCount = leadStates.filter((l) =>
        ['site_generated', 'generating_message', 'message_ready', 'sending', 'sent'].includes(l.status)
      ).length
      const messagesCount = leadStates.filter((l) =>
        ['message_ready', 'sending', 'sent'].includes(l.status)
      ).length
      const sentCount = leadStates.filter((l) => l.status === 'sent').length

      dispatch({
        type: 'SYNC',
        stage: (run.stage as PipelineStage) || 'searching',
        leads: leadStates,
        runErrors: Array.isArray(run.errors) ? (run.errors as PipelineRun['errors']) : [],
        progress: {
          searched: 0,
          imported: leadStates.length,
          analyzed: analyzedCount,
          sitesGenerated: sitesCount,
          messagesGenerated: messagesCount,
          sent: sentCount,
          errors: errorCount,
        },
      })

      // Stop polling when done
      if (['completed', 'failed', 'cancelled'].includes(run.status as string)) {
        const finalStage = run.status === 'completed' ? 'done'
          : run.status === 'cancelled' ? 'done'
          : 'error'
        dispatch({ type: 'DONE', stage: finalStage as PipelineStage })
        return true // signal to stop
      }

      return false
    } catch {
      // Network error, keep polling
      return false
    }
  }, [])

  const startPolling = useCallback((runId: string) => {
    stopPolling()

    // Initial poll immediately
    poll(runId).then((done) => {
      if (done) return
    })

    pollingRef.current = setInterval(async () => {
      const done = await poll(runId)
      if (done) stopPolling()
    }, POLL_INTERVAL)
  }, [poll, stopPolling])

  // Check for active run on mount (resume after tab close)
  useEffect(() => {
    let cancelled = false

    async function checkActiveRun() {
      try {
        const res = await fetch('/api/pipeline')
        if (!res.ok) return
        const runs = await res.json()
        const active = (runs as Array<{ id: string; status: string }>).find(
          (r) => r.status === 'running'
        )
        if (active && !cancelled) {
          dispatch({ type: 'RESUMING', runId: active.id })
          startPolling(active.id)
        }
      } catch {
        // ignore
      }
    }

    checkActiveRun()
    return () => {
      cancelled = true
    }
  }, [startPolling])

  // Cleanup on unmount
  useEffect(() => {
    return () => stopPolling()
  }, [stopPolling])

  const run = useCallback(async (config: PipelineConfig) => {
    // POST to server-side pipeline
    const res = await fetch('/api/pipeline/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })

    const data = await res.json()
    if (!res.ok) throw new Error(data.error)

    dispatch({ type: 'START', runId: data.id })
    startPolling(data.id)
  }, [startPolling])

  const retry = useCallback(async (runId: string) => {
    const res = await fetch('/api/pipeline/retry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    dispatch({ type: 'RESUMING', runId })
    startPolling(runId)
  }, [startPolling])

  const cancel = useCallback(async () => {
    if (state.runId) {
      await fetch('/api/pipeline', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: state.runId, status: 'cancelled' }),
      })
    }
    // Polling will pick up the cancelled status
  }, [state.runId])

  return {
    state,
    run,
    cancel,
    retry,
    isRunning: !['idle', 'done', 'error'].includes(state.stage),
    reset: () => {
      stopPolling()
      dispatch({ type: 'RESET' })
    },
  }
}
