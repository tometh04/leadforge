'use client'

import { useState } from 'react'
import { Lead, LeadActivity, LeadStatus } from '@/types'
import { ScoreBadge } from './ScoreBadge'
import { StatusBadge, STATUS_LABELS } from './StatusBadge'
import {
  ExternalLink, Phone, MapPin, Tag, Clock, RefreshCw,
  MessageSquare, Globe, ChevronDown, ChevronUp, Loader2, Wand2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface LeadDetailPanelProps {
  lead: Lead
  activity: LeadActivity[]
  onUpdate: (updated: Lead) => void
  onAnalyze: () => Promise<void>
  analyzing: boolean
  onGenerateSite: () => Promise<void>
  generatingSite: boolean
  onOpenWhatsApp: () => void
}

const CRITERIA_LABELS: Record<string, string> = {
  design: 'Diseño visual',
  responsive: 'Responsive',
  speed: 'Velocidad',
  copy: 'Copy / Mensaje',
  cta: 'CTAs',
  seo: 'SEO básico',
  https: 'HTTPS',
  modernity: 'Modernidad',
}

export function LeadDetailPanel({
  lead,
  activity,
  onUpdate,
  onAnalyze,
  analyzing,
  onGenerateSite,
  generatingSite,
  onOpenWhatsApp,
}: LeadDetailPanelProps) {
  const [notes, setNotes] = useState(lead.notes ?? '')
  const [savingNotes, setSavingNotes] = useState(false)
  const [showCriteria, setShowCriteria] = useState(false)

  const handleStatusChange = async (newStatus: string) => {
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      const updated = await res.json()
      if (!res.ok) throw new Error(updated.error)
      onUpdate(updated)
      toast.success(`Estado actualizado a: ${STATUS_LABELS[newStatus as LeadStatus]?.label}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al actualizar')
    }
  }

  const handleSaveNotes = async () => {
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

  const handleWhatsApp = async () => {
    if (!lead.phone) { toast.error('Sin número de teléfono'); return }

    const rawPhone = lead.phone.replace(/\D/g, '')
    const phone = rawPhone.startsWith('0') ? rawPhone.slice(1) : rawPhone
    const siteText = lead.generated_site_url
      ? `\n\nPodés ver la nueva versión acá 👉 ${lead.generated_site_url}`
      : ''
    const message = encodeURIComponent(
      `Hola ${lead.business_name} 👋\n\nVi que tenés una página web y me tomé el atrevimiento de revisar cómo está.${siteText}\n\n¿Te parece si lo charlamos?`
    )
    window.open(`https://wa.me/${phone}?text=${message}`, '_blank')

    // Registrar contacto
    await fetch(`/api/leads/${lead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'contactado', last_contacted_at: new Date().toISOString() }),
    })
    await fetch(`/api/leads/${lead.id}/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'contactado', detail: 'Mensaje enviado por WhatsApp' }),
    })
    toast.success('WhatsApp abierto y lead marcado como contactado')
  }

  const criteriaEntries = lead.score_details
    ? Object.entries(CRITERIA_LABELS).map(([key, label]) => ({
        key,
        label,
        value: (lead.score_details as unknown as Record<string, number>)[key] ?? 0,
      }))
    : []

  return (
    <div className="flex flex-col gap-5 overflow-y-auto p-5 text-sm">
      {/* Header */}
      <div className="flex items-start gap-3">
        {lead.google_photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={lead.google_photo_url}
            alt={lead.business_name}
            className="h-12 w-12 rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-lg font-bold text-muted-foreground">
            {lead.business_name.charAt(0)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="truncate text-base font-bold">{lead.business_name}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StatusBadge status={lead.status as LeadStatus} />
            <Badge variant="outline" className="text-xs">{lead.category}</Badge>
          </div>
        </div>
      </div>

      <Separator />

      {/* Datos del negocio */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Información
        </p>
        <div className="space-y-1.5">
          {lead.address && (
            <div className="flex items-start gap-2 text-muted-foreground">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="text-xs">{lead.address}</span>
            </div>
          )}
          {lead.phone && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="h-3.5 w-3.5 shrink-0" />
              <span className="text-xs">{lead.phone}</span>
            </div>
          )}
          {lead.website && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Globe className="h-3.5 w-3.5 shrink-0" />
              <a
                href={lead.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                {new URL(lead.website).hostname.replace('www.', '')}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>
      </div>

      <Separator />

      {/* Score */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Score del sitio actual
          </p>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs"
            onClick={onAnalyze}
            disabled={analyzing}
          >
            {analyzing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            {lead.score ? 'Re-analizar' : 'Analizar'}
          </Button>
        </div>

        {lead.score ? (
          <div className="space-y-2">
            <ScoreBadge score={lead.score} size="lg" />
            {lead.score_details?.summary && (
              <p className="text-xs text-muted-foreground">{lead.score_details.summary}</p>
            )}

            {/* Problemas detectados */}
            {lead.score_details?.problems && lead.score_details.problems.length > 0 && (
              <div className="space-y-1">
                {lead.score_details.problems.map((p, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <span className="mt-0.5 text-xs text-red-500">•</span>
                    <span className="text-xs text-muted-foreground">{p}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Desglose de criterios */}
            <button
              onClick={() => setShowCriteria(!showCriteria)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {showCriteria ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              Ver desglose
            </button>

            {showCriteria && (
              <div className="space-y-2 rounded-lg border p-3">
                {criteriaEntries.map(({ key, label, value }) => (
                  <div key={key} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{label}</span>
                      <span className={cn(
                        'font-medium',
                        value <= 4 && 'text-red-600',
                        value >= 5 && value <= 6 && 'text-yellow-600',
                        value >= 7 && 'text-green-600',
                      )}>{value}/10</span>
                    </div>
                    <Progress value={value * 10} className="h-1.5" />
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {analyzing ? 'Analizando sitio web...' : 'Sin análisis todavía.'}
          </p>
        )}
      </div>

      {/* Preview sitio generado */}
      {lead.generated_site_url && (
        <>
          <Separator />
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Sitio generado
            </p>
            <div className="overflow-hidden rounded-lg border">
              <iframe
                src={lead.generated_site_url}
                className="h-40 w-full"
                title={`Preview de ${lead.business_name}`}
              />
            </div>
            <a
              href={lead.generated_site_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Ver sitio completo
            </a>
          </div>
        </>
      )}

      <Separator />

      {/* Acciones rápidas */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Acciones
        </p>
        <div className="flex flex-col gap-2">
          <Button
            size="sm"
            variant="default"
            className="w-full justify-start gap-2"
            onClick={onGenerateSite}
            disabled={generatingSite}
          >
            {generatingSite ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            {lead.generated_site_url ? 'Regenerar sitio' : 'Generar sitio web'}
          </Button>

          {lead.generated_site_url && (
            <a
              href={lead.generated_site_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-primary hover:bg-accent"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Ver sitio generado
            </a>
          )}

          <Button
            size="sm"
            variant="outline"
            className="w-full justify-start gap-2 border-green-200 text-green-700 hover:bg-green-50 hover:border-green-300"
            onClick={onOpenWhatsApp}
          >
            <MessageSquare className="h-4 w-4" />
            Enviar WhatsApp
          </Button>
        </div>
      </div>

      <Separator />

      {/* Cambiar estado */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Cambiar estado
        </p>
        <Select value={lead.status} onValueChange={handleStatusChange}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(STATUS_LABELS).map(([value, { label }]) => (
              <SelectItem key={value} value={value} className="text-xs">
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* Notas */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Notas
        </p>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Agregar nota..."
          className="min-h-20 text-xs resize-none"
        />
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={handleSaveNotes}
          disabled={savingNotes || notes === (lead.notes ?? '')}
        >
          {savingNotes ? 'Guardando...' : 'Guardar nota'}
        </Button>
      </div>

      {/* Timeline de actividad */}
      {activity.length > 0 && (
        <>
          <Separator />
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Actividad
            </p>
            <div className="space-y-2">
              {activity.map((a) => (
                <div key={a.id} className="flex items-start gap-2">
                  <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-xs">
                      <span className="font-medium">{a.action}</span>
                      {a.detail && (
                        <span className="text-muted-foreground"> — {a.detail}</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(a.created_at).toLocaleString('es-AR', {
                        day: '2-digit', month: '2-digit', year: '2-digit',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Tags */}
      {lead.tags && lead.tags.length > 0 && (
        <>
          <Separator />
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              <Tag className="h-3 w-3" /> Tags
            </p>
            <div className="flex flex-wrap gap-1">
              {lead.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
