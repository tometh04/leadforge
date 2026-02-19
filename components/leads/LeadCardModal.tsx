'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Lead, LeadActivity, LeadStatus } from '@/types'
import { ScoreBadge } from './ScoreBadge'
import { StatusBadge, STATUS_LABELS } from './StatusBadge'
import {
  ExternalLink, Phone, MapPin, Globe, ChevronDown, ChevronUp,
  Loader2, Wand2, MessageSquare, RefreshCw, Clock, X, Star,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface LeadCardModalProps {
  lead: Lead | null
  activity: LeadActivity[]
  open: boolean
  onClose: () => void
  onUpdate: (updated: Lead) => void
  onAnalyze: () => Promise<void>
  analyzing: boolean
  onGenerateSite: () => void
  generatingSite: boolean
  onOpenWhatsApp: () => void
}

const CRITERIA_LABELS: Record<string, string> = {
  design: 'Diseño',
  responsive: 'Responsive',
  speed: 'Velocidad',
  copy: 'Copy',
  cta: 'CTAs',
  seo: 'SEO',
  https: 'HTTPS',
  modernity: 'Modernidad',
}

export function LeadCardModal({
  lead, activity, open, onClose, onUpdate,
  onAnalyze, analyzing, onGenerateSite, generatingSite, onOpenWhatsApp,
}: LeadCardModalProps) {
  const [notes, setNotes] = useState(lead?.notes ?? '')
  const [savingNotes, setSavingNotes] = useState(false)
  const [showProblems, setShowProblems] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  // Sync notes when different lead opens
  useEffect(() => {
    if (lead) setNotes(lead.notes ?? '')
  }, [lead?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Lock body scroll
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const handleStatusChange = async (newStatus: string) => {
    if (!lead) return
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      const updated = await res.json()
      if (!res.ok) throw new Error(updated.error)
      onUpdate(updated)
      toast.success(`Estado → ${STATUS_LABELS[newStatus as LeadStatus]?.label}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al actualizar')
    }
  }

  const handleSaveNotes = async () => {
    if (!lead) return
    setSavingNotes(true)
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      })
      const updated = await res.json()
      if (!res.ok) throw new Error(updated.error)
      onUpdate(updated)
      toast.success('Nota guardada')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSavingNotes(false)
    }
  }

  const criteriaEntries = lead?.score_details
    ? Object.entries(CRITERIA_LABELS).map(([key, label]) => ({
        key, label,
        value: (lead.score_details as unknown as Record<string, number>)[key] ?? 0,
      }))
    : []

  const hostname = (() => {
    try { return new URL(lead?.website ?? '').hostname.replace('www.', '') } catch { return lead?.website ?? '' }
  })()

  if (!mounted || !lead) return null
  if (!open) return null

  const modal = (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="relative flex flex-col rounded-xl border bg-background shadow-2xl overflow-hidden"
        style={{ width: 'min(1400px, 96vw)', height: '92vh' }}
        onClick={(e) => e.stopPropagation()}
      >

        {/* ══════════════════════════════════════════════════════════
            HEADER
        ══════════════════════════════════════════════════════════ */}
        <div className="flex items-center gap-3 border-b px-5 py-3 shrink-0 bg-background/95">
          {/* Avatar */}
          {lead.google_photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={lead.google_photo_url} alt=""
              className="h-9 w-9 rounded-lg object-cover shrink-0 ring-1 ring-border" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary shrink-0">
              {lead.business_name.charAt(0)}
            </div>
          )}

          {/* Name + badges */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <span className="font-bold text-sm truncate max-w-[200px]">{lead.business_name}</span>
            <StatusBadge status={lead.status as LeadStatus} />
            <Badge variant="outline" className="text-xs shrink-0 hidden sm:inline-flex">{lead.category}</Badge>
            {lead.rating && (
              <span className="hidden md:flex items-center gap-0.5 text-xs text-muted-foreground shrink-0">
                <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />{lead.rating}
              </span>
            )}
          </div>

          {/* Info chips */}
          <div className="hidden xl:flex items-center gap-5 text-xs text-muted-foreground">
            {lead.phone && (
              <span className="flex items-center gap-1.5">
                <Phone className="h-3 w-3 text-muted-foreground/60" />
                {lead.phone}
              </span>
            )}
            {lead.website && (
              <a href={lead.website} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 hover:text-primary transition-colors">
                <Globe className="h-3 w-3 text-muted-foreground/60" />
                {hostname}
                <ExternalLink className="h-2.5 w-2.5 opacity-60" />
              </a>
            )}
            {lead.address && (
              <span className="flex items-center gap-1.5 max-w-[240px] truncate">
                <MapPin className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                <span className="truncate">{lead.address}</span>
              </span>
            )}
          </div>

          {/* Close */}
          <button onClick={onClose}
            className="ml-auto rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ══════════════════════════════════════════════════════════
            BODY — 3 COLUMNS
        ══════════════════════════════════════════════════════════ */}
        <div className="flex flex-1 min-h-0">

          {/* ──────────────────────────────────────────────
              COL 1 — Score, Pipeline, Actividad
          ────────────────────────────────────────────── */}
          <div className="w-[272px] shrink-0 border-r flex flex-col overflow-y-auto">

            {/* Score */}
            <div className="p-4 border-b">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Score actual
                </span>
                <Button size="sm" variant="ghost"
                  className="h-6 gap-1 text-xs px-2 text-muted-foreground hover:text-foreground"
                  onClick={onAnalyze} disabled={analyzing}>
                  {analyzing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  {lead.score ? 'Re-analizar' : 'Analizar'}
                </Button>
              </div>

              {lead.score ? (
                <div className="space-y-3">
                  <ScoreBadge score={lead.score} size="lg" />

                  {/* Criterios en grid 2 cols */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-1">
                    {criteriaEntries.map(({ key, label, value }) => (
                      <div key={key}>
                        <div className="flex justify-between items-center mb-0.5">
                          <span className="text-[11px] text-muted-foreground truncate">{label}</span>
                          <span className={cn('text-[11px] font-bold ml-1 shrink-0',
                            value <= 4 && 'text-red-500',
                            value === 5 || value === 6 ? 'text-yellow-500' : '',
                            value >= 7 && 'text-green-500',
                          )}>{value}</span>
                        </div>
                        <Progress value={value * 10} className="h-1" />
                      </div>
                    ))}
                  </div>

                  {lead.score_details?.summary && (
                    <p className="text-xs text-muted-foreground leading-relaxed border-t pt-2.5">
                      {lead.score_details.summary}
                    </p>
                  )}

                  {lead.score_details?.problems && lead.score_details.problems.length > 0 && (
                    <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900 overflow-hidden">
                      <button
                        onClick={() => setShowProblems(!showProblems)}
                        className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-red-700 dark:text-red-400 hover:bg-red-100/50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        <span>⚠ {lead.score_details.problems.length} problemas detectados</span>
                        {showProblems ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                      {showProblems && (
                        <ul className="px-3 pb-3 space-y-1.5 border-t border-red-100 dark:border-red-900 pt-2">
                          {lead.score_details.problems.map((p, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
                              <span className="shrink-0 mt-0.5">•</span>
                              <span className="leading-snug">{p}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-5 space-y-3">
                  <div className="text-2xl">🔍</div>
                  <p className="text-xs text-muted-foreground">
                    {analyzing ? 'Analizando con Puppeteer...' : 'Sin análisis todavía'}
                  </p>
                  {!analyzing && (
                    <Button size="sm" variant="outline" className="text-xs h-8 w-full" onClick={onAnalyze}>
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                      Analizar ahora
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Pipeline */}
            <div className="p-4 border-b">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Estado del pipeline
              </p>
              <Select value={lead.status} onValueChange={handleStatusChange}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([value, { label }]) => (
                    <SelectItem key={value} value={value} className="text-xs">{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Actividad */}
            {activity.length > 0 && (
              <div className="p-4 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Actividad
                </p>
                <div className="space-y-3.5">
                  {activity.slice(0, 8).map((a) => (
                    <div key={a.id} className="flex items-start gap-2 group">
                      <div className="mt-0.5 h-5 w-5 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <Clock className="h-2.5 w-2.5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium capitalize">{a.action.replace('_', ' ')}</p>
                        {a.detail && (
                          <p className="text-[11px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">{a.detail}</p>
                        )}
                        <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                          {new Date(a.created_at).toLocaleString('es-AR', {
                            day: '2-digit', month: '2-digit',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ──────────────────────────────────────────────
              COL 2 — Preview del sitio (OCUPA TODO EL CENTRO)
          ────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0 flex flex-col" style={{ background: '#18181b' }}>
            {lead.generated_site_url ? (
              <>
                {/* Fake browser bar */}
                <div className="flex items-center gap-3 px-4 py-2.5 shrink-0"
                  style={{ background: '#27272a', borderBottom: '1px solid #3f3f46' }}>
                  <div className="flex gap-1.5 shrink-0">
                    <div className="w-3 h-3 rounded-full" style={{ background: '#ef4444' }} />
                    <div className="w-3 h-3 rounded-full" style={{ background: '#f59e0b' }} />
                    <div className="w-3 h-3 rounded-full" style={{ background: '#22c55e' }} />
                  </div>
                  <div className="flex-1 rounded-md px-3 py-1.5 text-xs font-mono truncate"
                    style={{ background: '#3f3f46', color: '#a1a1aa' }}>
                    {lead.generated_site_url}
                  </div>
                  <a href={lead.generated_site_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs font-medium shrink-0 transition-colors"
                    style={{ color: '#a1a1aa' }}
                    onMouseOver={e => (e.currentTarget.style.color = '#ffffff')}
                    onMouseOut={e => (e.currentTarget.style.color = '#a1a1aa')}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Abrir
                  </a>
                </div>
                {/* THE IFRAME */}
                <iframe
                  src={lead.generated_site_url}
                  className="flex-1 w-full border-0"
                  title={`Preview — ${lead.business_name}`}
                />
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8 text-center">
                <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl"
                  style={{ background: '#27272a' }}>
                  🌐
                </div>
                <div>
                  <p className="font-semibold mb-1.5" style={{ color: '#e4e4e7' }}>Sin sitio generado</p>
                  <p className="text-sm max-w-xs" style={{ color: '#71717a' }}>
                    Generá el sitio propuesto para este negocio y verás el preview acá.
                  </p>
                </div>
                <Button onClick={onGenerateSite} disabled={generatingSite}
                  className="gap-2 bg-white text-zinc-900 hover:bg-zinc-100 font-semibold">
                  {generatingSite
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Wand2 className="h-4 w-4" />}
                  {generatingSite ? 'Generando...' : 'Generar sitio ahora'}
                </Button>
              </div>
            )}
          </div>

          {/* ──────────────────────────────────────────────
              COL 3 — Acciones + Notas
          ────────────────────────────────────────────── */}
          <div className="w-[248px] shrink-0 border-l flex flex-col overflow-y-auto">

            {/* Acciones */}
            <div className="p-4 border-b space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Acciones
              </p>

              <Button className="w-full justify-start gap-2 h-9 text-sm"
                onClick={onGenerateSite} disabled={generatingSite}>
                {generatingSite
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Wand2 className="h-4 w-4" />}
                {lead.generated_site_url ? 'Regenerar sitio' : 'Generar sitio'}
              </Button>

              {lead.generated_site_url && (
                <a href={lead.generated_site_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full rounded-md border border-border px-3 h-9 text-sm font-medium hover:bg-accent transition-colors">
                  <ExternalLink className="h-4 w-4" />
                  Ver sitio completo
                </a>
              )}

              <Button variant="outline"
                className="w-full justify-start gap-2 h-9 text-sm border-green-200 text-green-700 hover:bg-green-50 hover:border-green-300 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-950"
                onClick={onOpenWhatsApp}>
                <MessageSquare className="h-4 w-4" />
                Enviar WhatsApp
              </Button>
            </div>

            {/* Notas */}
            <div className="p-4 flex flex-col gap-2 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Notas internas
              </p>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anotá algo sobre este lead..."
                className="flex-1 min-h-[200px] text-sm resize-none"
              />
              <Button size="sm" variant="outline" className="w-full h-8 text-xs"
                onClick={handleSaveNotes}
                disabled={savingNotes || notes === (lead.notes ?? '')}>
                {savingNotes ? 'Guardando...' : 'Guardar nota'}
              </Button>
            </div>

            {/* Tags */}
            {lead.tags && lead.tags.length > 0 && (
              <div className="p-4 border-t">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Tags</p>
                <div className="flex flex-wrap gap-1">
                  {lead.tags.map(tag => (
                    <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

        </div>{/* end body */}
      </div>{/* end modal box */}
    </div>  // end overlay
  )

  return createPortal(modal, document.body)
}
