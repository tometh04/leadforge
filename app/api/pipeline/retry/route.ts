import { NextRequest, NextResponse, after } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { processStage } from '../run/stages'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  try {
    const { runId } = await req.json()
    if (!runId) {
      return NextResponse.json({ error: 'runId is required' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // 1. Fetch the run — only allow retry on failed/cancelled
    const { data: run, error: runError } = await supabase
      .from('pipeline_runs')
      .select('*')
      .eq('id', runId)
      .single()

    if (runError || !run) {
      return NextResponse.json({ error: 'Run no encontrado' }, { status: 404 })
    }

    if (!['failed', 'cancelled'].includes(run.status)) {
      return NextResponse.json(
        { error: `No se puede reintentar un run con estado "${run.status}"` },
        { status: 400 }
      )
    }

    const config = run.config as {
      skipAnalysis?: boolean
      skipSiteGeneration?: boolean
      skipMessages?: boolean
      skipSending?: boolean
    }

    // 2. Fetch all pipeline_leads for this run
    const { data: pLeads } = await supabase
      .from('pipeline_leads')
      .select('*')
      .eq('run_id', runId)

    const leads = pLeads ?? []

    // 3. Reset stuck leads back to their last completed state
    for (const pl of leads) {
      let resetStatus: string | null = null

      switch (pl.status) {
        case 'analyzing':
          resetStatus = 'pending'
          break
        case 'generating_site':
          resetStatus = 'analyzed'
          break
        case 'generating_message':
          resetStatus = 'site_generated'
          break
        case 'sending':
          resetStatus = 'message_ready'
          break
        case 'error':
          // Infer last completed state from existing data
          if (pl.site_url) {
            resetStatus = 'site_generated'
          } else if (pl.score) {
            resetStatus = 'analyzed'
          } else {
            resetStatus = 'pending'
          }
          break
      }

      if (resetStatus) {
        await supabase
          .from('pipeline_leads')
          .update({ status: resetStatus, error: null })
          .eq('id', pl.id)
      }
    }

    // 4. Determine resume stage
    let resumeStage: string

    if (!run.search_results) {
      resumeStage = 'search'
    } else if (leads.length === 0) {
      resumeStage = 'import'
    } else {
      // Re-fetch leads after reset to get updated statuses
      const { data: updatedLeads } = await supabase
        .from('pipeline_leads')
        .select('status')
        .eq('run_id', runId)

      const statuses = (updatedLeads ?? []).map((l) => l.status)
      const hasPending = statuses.includes('pending')
      const hasAnalyzed = statuses.includes('analyzed')
      const hasSiteGenerated = statuses.includes('site_generated')
      const hasMessageReady = statuses.includes('message_ready')

      if (hasPending && !config.skipAnalysis) {
        resumeStage = 'analyze'
      } else if (hasAnalyzed && !config.skipSiteGeneration) {
        resumeStage = 'generate_sites'
      } else if (hasSiteGenerated && !config.skipMessages) {
        resumeStage = 'generate_messages'
      } else if (hasMessageReady && !config.skipSending) {
        resumeStage = 'send'
      } else {
        // Nothing left to do — mark as completed
        await supabase
          .from('pipeline_runs')
          .update({
            status: 'completed',
            stage: 'done',
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', runId)

        return NextResponse.json({ id: runId, stage: 'done' })
      }
    }

    // 5. Map internal stage name to the UI stage name for the run row
    const stageToRunStage: Record<string, string> = {
      search: 'searching',
      import: 'importing',
      analyze: 'analyzing',
      generate_sites: 'generating_sites',
      generate_messages: 'generating_messages',
      send: 'sending',
    }

    await supabase
      .from('pipeline_runs')
      .update({
        status: 'running',
        stage: stageToRunStage[resumeStage] ?? resumeStage,
        completed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', runId)

    // 6. Fire-and-forget: resume processing after response
    after(async () => {
      await processStage(runId, resumeStage)
    })

    return NextResponse.json({ id: runId, stage: resumeStage })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
