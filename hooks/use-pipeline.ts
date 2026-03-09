'use client'

import { useReducer, useRef, useCallback, useEffect } from 'react'
import type { PipelineStage, PipelineLeadState, PipelineLeadRow, PipelineRun } from '@/types'

export interface PipelineConfig {
  niche: string
  city: string
  maxResults: number
  skipAnalysis: boolean
  skipSiteGeneration: boolean
  skipMessages: boolean
  skipSending: boolean
  whatsappAccountId?: string
}

export interface RunState {
  runId: string
  accountId: string | null
  accountLabel: string
  niche: string
  city: string
  stage: PipelineStage
  leads: PipelineLeadState[]
  runErrors: PipelineRun['errors']
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

interface MultiPipelineState {
  runs: Map<string, RunState>
}

type MultiAction =
  | { type: 'ADD_RUN'; run: RunState }
  | { type: 'SYNC_RUN'; runId: string; updates: Partial<RunState> }
  | { type: 'REMOVE_RUN'; runId: string }
  | { type: 'RESUME_RUNS'; runs: RunState[] }

const initialState: MultiPipelineState = { runs: new Map() }

const emptyProgress = {
  searched: 0,
  imported: 0,
  analyzed: 0,
  sitesGenerated: 0,
  messagesGenerated: 0,
  sent: 0,
  errors: 0,
}

function reducer(state: MultiPipelineState, action: MultiAction): MultiPipelineState {
  const next = new Map(state.runs)
  switch (action.type) {
    case 'ADD_RUN':
      next.set(action.run.runId, action.run)
      return { runs: next }
    case 'SYNC_RUN': {
      const existing = next.get(action.runId)
      if (!existing) return state
      next.set(action.runId, { ...existing, ...action.updates })
      return { runs: next }
    }
    case 'REMOVE_RUN':
      next.delete(action.runId)
      return { runs: next }
    case 'RESUME_RUNS':
      for (const r of action.runs) next.set(r.runId, r)
      return { runs: next }
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

function computeProgress(leads: PipelineLeadState[]) {
  const errorCount = leads.filter((l) => l.status === 'error').length
  const analyzedCount = leads.filter((l) =>
    ['analyzed', 'generating_site', 'site_generated', 'generating_message', 'message_ready', 'sending', 'sent'].includes(l.status)
  ).length
  const sitesCount = leads.filter((l) =>
    ['site_generated', 'generating_message', 'message_ready', 'sending', 'sent'].includes(l.status)
  ).length
  const messagesCount = leads.filter((l) =>
    ['message_ready', 'sending', 'sent'].includes(l.status)
  ).length
  const sentCount = leads.filter((l) => l.status === 'sent').length

  return {
    searched: 0,
    imported: leads.length,
    analyzed: analyzedCount,
    sitesGenerated: sitesCount,
    messagesGenerated: messagesCount,
    sent: sentCount,
    errors: errorCount,
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

  /** Poll all active runs in one cycle */
  const pollAll = useCallback(async () => {
    const currentRuns = stateRef.current.runs
    const activeRunIds = Array.from(currentRuns.keys()).filter((id) => {
      const r = currentRuns.get(id)!
      return !['idle', 'done', 'error'].includes(r.stage)
    })

    if (activeRunIds.length === 0) return

    try {
      // Fetch all runs once
      const runRes = await fetch('/api/pipeline')
      if (!runRes.ok) return
      const allRuns: PipelineRun[] = await runRes.json()

      // Fetch leads for each active run in parallel
      const leadsResults = await Promise.all(
        activeRunIds.map(async (runId) => {
          try {
            const res = await fetch(`/api/pipeline/leads?runId=${runId}`)
            if (!res.ok) return { runId, leads: [] }
            const data = await res.json()
            return { runId, leads: data.leads ?? [] }
          } catch {
            return { runId, leads: [] }
          }
        })
      )

      const leadsMap = new Map(leadsResults.map((r) => [r.runId, r.leads]))

      for (const runId of activeRunIds) {
        const run = allRuns.find((r) => r.id === runId)
        if (!run) continue

        const dbLeads: PipelineLeadRow[] = leadsMap.get(runId) ?? []
        const prevLeads = currentRuns.get(runId)?.leads ?? []

        const leadStates: PipelineLeadState[] = dbLeads.map((row) => {
          const mapped = dbLeadToState(row)
          const prev = prevLeads.find((p) => p.leadId === mapped.leadId)
          mapped.updatedAt =
            prev && prev.status === mapped.status ? prev.updatedAt : Date.now()
          return mapped
        })

        const isDone = ['completed', 'failed', 'cancelled'].includes(run.status)
        const finalStage: PipelineStage = isDone
          ? run.status === 'failed'
            ? 'error'
            : 'done'
          : (run.stage as PipelineStage) || 'searching'

        dispatch({
          type: 'SYNC_RUN',
          runId,
          updates: {
            stage: finalStage,
            leads: leadStates,
            runErrors: Array.isArray(run.errors) ? run.errors : [],
            progress: computeProgress(leadStates),
            resuming: false,
            niche: run.niche,
            city: run.city,
          },
        })
      }
    } catch {
      // Network error, keep polling
    }
  }, [])

  const ensurePolling = useCallback(() => {
    if (pollingRef.current) return
    // Initial poll immediately
    pollAll()
    pollingRef.current = setInterval(pollAll, POLL_INTERVAL)
  }, [pollAll])

  // Stop polling when no active runs remain
  useEffect(() => {
    const hasActive = Array.from(state.runs.values()).some(
      (r) => !['idle', 'done', 'error'].includes(r.stage)
    )
    if (!hasActive && pollingRef.current) {
      stopPolling()
    }
  }, [state.runs, stopPolling])

  // Check for active runs on mount (resume after tab close)
  useEffect(() => {
    let cancelled = false

    async function checkActiveRuns() {
      try {
        const res = await fetch('/api/pipeline')
        if (!res.ok) return
        const runs: PipelineRun[] = await res.json()
        const active = runs.filter((r) => r.status === 'running')
        if (active.length > 0 && !cancelled) {
          const resumeRuns: RunState[] = active.map((r) => ({
            runId: r.id,
            accountId: r.whatsapp_account_id ?? null,
            accountLabel: '',
            niche: r.niche,
            city: r.city,
            stage: (r.stage as PipelineStage) || 'searching',
            leads: [],
            runErrors: [],
            progress: { ...emptyProgress },
            error: null,
            resuming: true,
          }))
          dispatch({ type: 'RESUME_RUNS', runs: resumeRuns })
          ensurePolling()
        }
      } catch {
        // ignore
      }
    }

    checkActiveRuns()
    return () => {
      cancelled = true
    }
  }, [ensurePolling])

  // Cleanup on unmount
  useEffect(() => {
    return () => stopPolling()
  }, [stopPolling])

  const run = useCallback(
    async (config: PipelineConfig, accountLabel?: string) => {
      const res = await fetch('/api/pipeline/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      const newRun: RunState = {
        runId: data.id,
        accountId: config.whatsappAccountId ?? null,
        accountLabel: accountLabel ?? '',
        niche: config.niche,
        city: config.city,
        stage: 'searching',
        leads: [],
        runErrors: [],
        progress: { ...emptyProgress },
        error: null,
        resuming: false,
      }

      dispatch({ type: 'ADD_RUN', run: newRun })
      ensurePolling()
    },
    [ensurePolling]
  )

  const retry = useCallback(
    async (runId: string) => {
      const res = await fetch('/api/pipeline/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      dispatch({
        type: 'SYNC_RUN',
        runId,
        updates: { stage: 'searching', resuming: true, error: null },
      })
      ensurePolling()
    },
    [ensurePolling]
  )

  const cancel = useCallback(async (runId: string) => {
    await fetch('/api/pipeline', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: runId, status: 'cancelled' }),
    })
    // Polling will pick up the cancelled status
  }, [])

  const removeRun = useCallback((runId: string) => {
    dispatch({ type: 'REMOVE_RUN', runId })
  }, [])

  const runsArray = Array.from(state.runs.values())

  return {
    runs: runsArray,
    run,
    cancel,
    retry,
    removeRun,
    activeRunCount: runsArray.filter(
      (r) => !['idle', 'done', 'error'].includes(r.stage)
    ).length,
    isRunningForAccount: (accountId: string) =>
      runsArray.some(
        (r) =>
          r.accountId === accountId &&
          !['idle', 'done', 'error'].includes(r.stage)
      ),
    hasAnyRunning: runsArray.some(
      (r) => !['idle', 'done', 'error'].includes(r.stage)
    ),
  }
}
