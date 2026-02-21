import { NextRequest, NextResponse, after } from 'next/server'
import { processStage } from '../stages'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  const { runId, stage } = await req.json()
  if (!runId || !stage) {
    return NextResponse.json({ error: 'runId and stage required' }, { status: 400 })
  }

  after(async () => {
    await processStage(runId, stage, 'a')
  })

  return NextResponse.json({ ok: true })
}
