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
