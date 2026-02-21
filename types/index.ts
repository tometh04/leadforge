export type LeadStatus =
  | 'nuevo'
  | 'analizado'
  | 'candidato'
  | 'sitio_generado'
  | 'contactado'
  | 'en_negociacion'
  | 'cerrado'
  | 'descartado'

export type ScoreBadge = 'critico' | 'mejorable' | 'aceptable'

export interface Lead {
  id: string
  created_at: string
  place_id: string
  business_name: string
  address: string
  phone: string
  website: string
  category: string
  rating: number | null
  google_photo_url: string | null
  niche: string
  city: string
  status: LeadStatus
  score: number | null
  score_summary: string | null
  score_details: ScoreDetails | null
  generated_site_url: string | null
  notes: string | null
  tags: string[]
  last_contacted_at: string | null
}

export interface ScoreDetails {
  design: number
  responsive: number
  speed: number
  copy: number
  cta: number
  seo: number
  https: number
  modernity: number
  problems: string[]
  summary: string
}

export interface Message {
  id: string
  lead_id: string
  sent_at: string
  channel: string
  message_body: string
  template_used: string | null
}

export interface LeadActivity {
  id: string
  lead_id: string
  created_at: string
  action: string
  detail: string | null
}

export interface ScraperSearch {
  id: string
  created_at: string
  niche: string
  city: string
  max_results: number
  total_found: number
  new_found: number
  viable: number
  discarded: number
}

export interface PipelineRun {
  id: string
  created_at: string
  niche: string
  city: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  stage: PipelineStage
  config: Record<string, unknown>
  total_leads: number
  analyzed: number
  sites_generated: number
  messages_sent: number
  errors: Array<{ leadId: string; step: string; error: string }>
  completed_at: string | null
}

export type PipelineStage =
  | 'idle'
  | 'searching'
  | 'importing'
  | 'analyzing'
  | 'generating_sites'
  | 'generating_messages'
  | 'sending'
  | 'done'
  | 'error'

export interface PipelineLeadState {
  leadId: string
  businessName: string
  phone: string
  status:
    | 'pending'
    | 'analyzing'
    | 'analyzed'
    | 'generating_site'
    | 'site_generated'
    | 'generating_message'
    | 'message_ready'
    | 'sending'
    | 'sent'
    | 'skipped'
    | 'error'
  score?: number
  siteUrl?: string
  message?: string
  error?: string
}

export interface PipelineLeadRow {
  id: string
  run_id: string
  lead_id: string | null
  business_name: string
  phone: string
  status: PipelineLeadState['status']
  score: number | null
  site_url: string | null
  message: string | null
  error: string | null
  created_at: string
}

export interface ScraperResult {
  place_id: string
  business_name: string
  address: string
  phone: string
  website: string
  rating: number | null
  category: string
  google_photo_url: string | null
  already_imported?: boolean
}
