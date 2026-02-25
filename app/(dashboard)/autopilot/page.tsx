'use client'

import React, { useState, useEffect } from 'react'
import {
  Rocket,
  Search,
  Import,
  BarChart3,
  Globe,
  MessageSquare,
  Send,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  SkipForward,
  ChevronDown,
  Clock,
  RefreshCw,
  Phone,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { usePipeline } from '@/hooks/use-pipeline'
import { LeadCardModal } from '@/components/leads/LeadCardModal'
import type { Lead, LeadActivity, WhatsAppAccount } from '@/types'
import type { PipelineStage, PipelineLeadState, PipelineRun, PipelineLeadRow } from '@/types'

interface WhatsAppAccountCheck extends WhatsAppAccount {
  checking: boolean
  connected: boolean | null
}

const NICHES = [
  'Restaurantes',
  'Dentistas',
  'Gimnasios',
  'Abogados',
  'Contadores',
  'Peluquerías',
  'Hoteles',
  'Farmacias',
  'Veterinarias',
  'Inmobiliarias',
  'Constructoras',
  'Spas',
  'Cafeterías',
  'Ferreterías',
  'Clínicas',
]

const STAGES: { key: PipelineStage; label: string; icon: React.ElementType }[] = [
  { key: 'searching', label: 'Buscar', icon: Search },
  { key: 'importing', label: 'Importar', icon: Import },
  { key: 'analyzing', label: 'Analizar', icon: BarChart3 },
  { key: 'generating_sites', label: 'Generar sitios', icon: Globe },
  { key: 'generating_messages', label: 'Generar mensajes', icon: MessageSquare },
  { key: 'sending', label: 'Enviar', icon: Send },
]

type SiteGeneratorHealthResponse = {
  ok: boolean
  provider?: string
  model?: string
  endpoint?: string
  hasApiKey?: boolean
  latencyMs?: number
  preview?: string
  timeoutMs?: number
  checkedAt?: string
  error?: string
}

/** Map pipeline_lead statuses to the visual stage they belong to */
const STATUS_TO_STAGE_KEY: Record<string, PipelineStage> = {
  analyzing: 'analyzing',
  analyzed: 'analyzing',
  generating_site: 'generating_sites',
  site_generated: 'generating_sites',
  generating_message: 'generating_messages',
  message_ready: 'generating_messages',
  sending: 'sending',
  sent: 'sending',
}

function stageIndex(stage: PipelineStage): number {
  const idx = STAGES.findIndex((s) => s.key === stage)
  if (stage === 'done') return STAGES.length
  if (stage === 'processing') return -1 // handled specially
  return idx
}

const ACTIVE_STATUSES = ['analyzing', 'generating_site', 'generating_message', 'sending']

function ElapsedTimer({ since }: { since: number }) {
  const [now, setNow] = useState(since)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const seconds = Math.floor((now - since) / 1000)
  const min = Math.floor(seconds / 60)
  const sec = seconds % 60
  return (
    <span className="text-xs tabular-nums text-muted-foreground">
      {min > 0 ? `${min}m ${sec}s` : `${sec}s`}
    </span>
  )
}

function LeadStatusBadge({ status }: { status: PipelineLeadState['status'] }) {
  const variants: Record<string, { label: string; className: string }> = {
    pending: { label: 'Pendiente', className: 'bg-muted text-muted-foreground' },
    analyzing: { label: 'Analizando...', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
    analyzed: { label: 'Analizado', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
    generating_site: { label: 'Generando sitio...', className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
    site_generated: { label: 'Sitio generado', className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
    generating_message: { label: 'Generando mensaje...', className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
    message_ready: { label: 'Mensaje listo', className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
    sending: { label: 'Enviando...', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
    sent: { label: 'Enviado', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
    skipped: { label: 'Omitido', className: 'bg-muted text-muted-foreground' },
    error: { label: 'Error', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  }
  const v = variants[status] || variants.pending
  return <Badge className={v.className}>{v.label}</Badge>
}

export default function AutopilotPage() {
  const { state, run, cancel, retry, isRunning, reset } = usePipeline()
  const [niche, setNiche] = useState('')
  const [city, setCity] = useState('')
  const [maxResults, setMaxResults] = useState(20)
  const [skipAnalysis, setSkipAnalysis] = useState(false)
  const [skipSites, setSkipSites] = useState(false)
  const [skipMessages, setSkipMessages] = useState(false)
  const [skipSending, setSkipSending] = useState(false)
  const [whatsappAccounts, setWhatsappAccounts] = useState<WhatsAppAccountCheck[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string>('')
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [selectedActivity, setSelectedActivity] = useState<LeadActivity[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [loadingLead, setLoadingLead] = useState<string | null>(null)
  const [checkingSiteModel, setCheckingSiteModel] = useState(false)
  const [siteHealth, setSiteHealth] = useState<SiteGeneratorHealthResponse | null>(null)

  useEffect(() => {
    // Fetch user's WhatsApp accounts
    fetch('/api/whatsapp/accounts')
      .then((r) => r.json())
      .then(async (accounts: WhatsAppAccount[]) => {
        const withCheck: WhatsAppAccountCheck[] = accounts.map((a) => ({
          ...a,
          checking: true,
          connected: null,
        }))
        setWhatsappAccounts(withCheck)

        // Check each account's connection
        for (const account of withCheck) {
          try {
            const res = await fetch(`/api/whatsapp/accounts/${account.id}/check`)
            const data = await res.json()
            setWhatsappAccounts((prev) =>
              prev.map((a) =>
                a.id === account.id
                  ? { ...a, checking: false, connected: data.connected ?? false, phone_number: data.phone ?? a.phone_number }
                  : a
              )
            )
          } catch {
            setWhatsappAccounts((prev) =>
              prev.map((a) =>
                a.id === account.id ? { ...a, checking: false, connected: false } : a
              )
            )
          }
        }
      })
      .catch(() => setWhatsappAccounts([]))
  }, [])

  const handleRowClick = async (leadId: string) => {
    setLoadingLead(leadId)
    try {
      const [leadRes, activityRes] = await Promise.all([
        fetch(`/api/leads/${leadId}`),
        fetch(`/api/leads/${leadId}/activity`),
      ])
      const leadData = await leadRes.json()
      const activityData = await activityRes.json()
      setSelectedLead(leadData)
      setSelectedActivity(Array.isArray(activityData) ? activityData : [])
      setModalOpen(true)
    } catch {
      toast.error('No se pudo cargar el detalle del lead')
    } finally {
      setLoadingLead(null)
    }
  }

  const handleRun = async () => {
    if (!niche.trim() || !city.trim()) {
      toast.error('Completá el nicho y la ciudad')
      return
    }
    if (!skipSending && !selectedAccountId) {
      toast.error('Seleccioná un número de WhatsApp o activá "Omitir envío"')
      return
    }

    try {
      await run({
        niche: niche.trim(),
        city: city.trim(),
        maxResults,
        skipAnalysis,
        skipSiteGeneration: skipSites,
        skipMessages,
        skipSending,
        whatsappAccountId: skipSending ? undefined : selectedAccountId,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error en el pipeline')
    }
  }

  const handleCheckSiteModel = async () => {
    setCheckingSiteModel(true)
    try {
      const res = await fetch('/api/site-generator/health?timeoutMs=20000', {
        method: 'GET',
        cache: 'no-store',
      })
      const data = (await res.json()) as SiteGeneratorHealthResponse
      setSiteHealth(data)

      if (!res.ok || !data.ok) {
        toast.error(data.error || 'No se pudo validar el modelo de sitios')
        return
      }

      toast.success(
        `Modelo listo (${data.provider ?? 'openai-compatible'} · ${data.latencyMs ?? '-'}ms)`
      )
    } catch {
      setSiteHealth({
        ok: false,
        error: 'No se pudo conectar con /api/site-generator/health',
      })
      toast.error('No se pudo validar el modelo de sitios')
    } finally {
      setCheckingSiteModel(false)
    }
  }

  const currentStageIdx = stageIndex(state.stage)
  const { progress } = state

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Autopilot</h1>
        <p className="text-muted-foreground">
          Ejecutá el pipeline completo: buscar, analizar, generar sitios y enviar mensajes.
        </p>
      </div>

      {/* Resuming state */}
      {state.resuming && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-blue-300 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-blue-600 dark:text-blue-400" />
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
              Recuperando progreso...
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-300">
              Se detectó un pipeline en ejecución. Reconectando.
            </p>
          </div>
        </div>
      )}

      {/* WhatsApp warning */}
      {!skipSending && whatsappAccounts.length === 0 && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-yellow-300 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20">
          <AlertTriangle className="h-5 w-5 shrink-0 text-yellow-600 dark:text-yellow-400" />
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              No hay números de WhatsApp configurados
            </p>
            <p className="text-xs text-yellow-700 dark:text-yellow-300">
              El envío de mensajes no funcionará.{' '}
              <a href="/whatsapp" className="underline">
                Agregar número
              </a>{' '}
              o activá &quot;Omitir envío&quot;.
            </p>
          </div>
        </div>
      )}
      {!skipSending && whatsappAccounts.length > 0 && !whatsappAccounts.some((a) => a.connected) && !whatsappAccounts.some((a) => a.checking) && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-yellow-300 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20">
          <AlertTriangle className="h-5 w-5 shrink-0 text-yellow-600 dark:text-yellow-400" />
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              Ningún número de WhatsApp está conectado
            </p>
            <p className="text-xs text-yellow-700 dark:text-yellow-300">
              Verificá la conexión en{' '}
              <a href="/whatsapp" className="underline">
                WhatsApp
              </a>{' '}
              o activá &quot;Omitir envío&quot;.
            </p>
          </div>
        </div>
      )}

      {/* Configuración */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Configuración</CardTitle>
          <CardDescription>Definí los parámetros de la búsqueda y qué pasos ejecutar.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Nicho</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="ej. Dentistas"
                  value={niche}
                  onChange={(e) => setNiche(e.target.value)}
                  disabled={isRunning}
                />
                <Select onValueChange={(v) => setNiche(v)} disabled={isRunning}>
                  <SelectTrigger className="w-28 shrink-0">
                    <SelectValue placeholder="Lista" />
                  </SelectTrigger>
                  <SelectContent>
                    {NICHES.map((n) => (
                      <SelectItem key={n} value={n}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Ciudad / Zona</Label>
              <Input
                placeholder="ej. Palermo, Buenos Aires"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                disabled={isRunning}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Máx. resultados</Label>
              <Select
                value={String(maxResults)}
                onValueChange={(v) => setMaxResults(Number(v))}
                disabled={isRunning}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 20, 30, 50].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!skipSending && (
              <div className="space-y-1.5">
                <Label>Número WhatsApp</Label>
                <Select
                  value={selectedAccountId}
                  onValueChange={setSelectedAccountId}
                  disabled={isRunning}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar número" />
                  </SelectTrigger>
                  <SelectContent>
                    {whatsappAccounts.map((account) => (
                      <SelectItem
                        key={account.id}
                        value={account.id}
                        disabled={account.checking || account.connected === false}
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className={`inline-block h-2 w-2 rounded-full ${
                              account.checking
                                ? 'bg-gray-400 animate-pulse'
                                : account.connected
                                  ? 'bg-green-500'
                                  : 'bg-red-400'
                            }`}
                          />
                          {account.label}
                          {account.phone_number ? ` (+${account.phone_number.slice(0, 5)}...)` : ''}
                          {account.checking ? ' (verificando...)' : ''}
                          {!account.checking && account.connected === false ? ' (desconectado)' : ''}
                        </span>
                      </SelectItem>
                    ))}
                    {whatsappAccounts.length === 0 && (
                      <SelectItem value="_none" disabled>
                        No hay números configurados
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex items-end">
              {isRunning ? (
                <Button variant="destructive" onClick={cancel} className="w-full gap-2">
                  <XCircle className="h-4 w-4" />
                  Cancelar
                </Button>
              ) : state.stage === 'error' ? (
                <div className="flex w-full gap-2">
                  <Button
                    onClick={async () => {
                      try {
                        await retry(state.runId!)
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : 'Error al reintentar')
                      }
                    }}
                    className="flex-1 gap-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Reintentar
                  </Button>
                  <Button onClick={reset} variant="outline" className="flex-1 gap-2">
                    Nueva ejecución
                  </Button>
                </div>
              ) : state.stage === 'done' ? (
                <Button onClick={reset} variant="outline" className="w-full gap-2">
                  Nueva ejecución
                </Button>
              ) : (
                <Button onClick={handleRun} className="w-full gap-2">
                  <Rocket className="h-4 w-4" />
                  Ejecutar pipeline
                </Button>
              )}
            </div>
          </div>

          {/* Checkboxes de pasos opcionales */}
          <div className="mt-4 flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={skipAnalysis}
                onCheckedChange={(v) => setSkipAnalysis(!!v)}
                disabled={isRunning}
              />
              Omitir análisis
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={skipSites}
                onCheckedChange={(v) => setSkipSites(!!v)}
                disabled={isRunning}
              />
              Omitir generación de sitios
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={skipMessages}
                onCheckedChange={(v) => setSkipMessages(!!v)}
                disabled={isRunning}
              />
              Omitir generación de mensajes
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={skipSending}
                onCheckedChange={(v) => setSkipSending(!!v)}
                disabled={isRunning}
              />
              Omitir envío WhatsApp
            </label>
          </div>

          <div className="mt-4 rounded-lg border bg-muted/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Salud del generador de sitios</p>
                <p className="text-xs text-muted-foreground">
                  Verificá conexión y modelo antes de correr el pipeline.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCheckSiteModel}
                disabled={checkingSiteModel}
                className="gap-2"
              >
                {checkingSiteModel ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {checkingSiteModel ? 'Verificando...' : 'Probar modelo'}
              </Button>
            </div>

            {siteHealth && (
              <div
                className={`mt-3 rounded-md border px-3 py-2 text-xs ${
                  siteHealth.ok
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-300'
                    : 'border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  {siteHealth.ok ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5" />
                  )}
                  <span className="font-medium">
                    {siteHealth.ok ? 'Conexión OK' : 'Error de conexión'}
                  </span>
                </div>
                <p className="mt-1">
                  Proveedor: {siteHealth.provider || '—'} · Modelo: {siteHealth.model || '—'} ·
                  Latencia: {siteHealth.latencyMs ?? '—'}ms
                </p>
                <p className="mt-1 break-all text-[11px]">Endpoint: {siteHealth.endpoint || '—'}</p>
                {siteHealth.preview && (
                  <p className="mt-1 text-[11px]">Preview: {siteHealth.preview}</p>
                )}
                {!siteHealth.ok && siteHealth.error && (
                  <p className="mt-1 text-[11px]">Detalle: {siteHealth.error}</p>
                )}
                {siteHealth.checkedAt && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Último check: {formatDate(siteHealth.checkedAt)}
                  </p>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Progress Stepper */}
      {state.stage !== 'idle' && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Progreso</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              {STAGES.map((s, i) => {
                const Icon = s.icon
                let isActive: boolean
                let isComplete: boolean
                const isError = state.stage === 'error' && currentStageIdx === i

                if (state.stage === 'processing') {
                  // During parallel processing, compute per-stage status from lead states
                  const nonTerminal = state.leads.filter(
                    (l) => l.status !== 'skipped' && l.status !== 'error'
                  )
                  // Search & import are always complete during processing
                  if (s.key === 'searching' || s.key === 'importing') {
                    isActive = false
                    isComplete = true
                  } else {
                    const activeInStage = nonTerminal.some(
                      (l) => STATUS_TO_STAGE_KEY[l.status] === s.key &&
                        ACTIVE_STATUSES.includes(l.status)
                    )
                    const completedStatuses = nonTerminal.filter(
                      (l) => {
                        const stageKey = STATUS_TO_STAGE_KEY[l.status]
                        if (!stageKey) return false
                        const stageIdx = STAGES.findIndex((st) => st.key === stageKey)
                        const thisIdx = STAGES.findIndex((st) => st.key === s.key)
                        return stageIdx > thisIdx
                      }
                    )
                    const doneStatuses = nonTerminal.filter(
                      (l) => {
                        const stageKey = STATUS_TO_STAGE_KEY[l.status]
                        return stageKey === s.key && !ACTIVE_STATUSES.includes(l.status)
                      }
                    )
                    isActive = activeInStage
                    isComplete = !isActive && nonTerminal.length > 0 &&
                      (completedStatuses.length + doneStatuses.length) === nonTerminal.length
                  }
                } else {
                  isActive = s.key === state.stage
                  isComplete = currentStageIdx > i
                }

                return (
                  <div key={s.key} className="flex flex-1 flex-col items-center gap-1.5">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all ${
                        isError
                          ? 'border-red-500 bg-red-100 text-red-600 dark:bg-red-900/30'
                          : isActive
                            ? 'border-primary bg-primary text-primary-foreground'
                            : isComplete
                              ? 'border-green-500 bg-green-100 text-green-600 dark:bg-green-900/30'
                              : 'border-muted bg-muted text-muted-foreground'
                      }`}
                    >
                      {isActive && !isError ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : isComplete ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : isError ? (
                        <XCircle className="h-4 w-4" />
                      ) : (
                        <Icon className="h-4 w-4" />
                      )}
                    </div>
                    <span className="text-xs font-medium">{s.label}</span>
                  </div>
                )
              })}
            </div>

            {/* Contadores */}
            <div className="mt-6 grid grid-cols-3 gap-4 sm:grid-cols-6">
              <Stat label="Importados" value={progress.imported || state.leads.length} />
              <Stat label="Analizados" value={progress.analyzed} />
              <Stat label="Sitios" value={progress.sitesGenerated} />
              <Stat label="Mensajes" value={progress.messagesGenerated} />
              <Stat label="Enviados" value={progress.sent} />
              <Stat label="Errores" value={progress.errors} error />
            </div>

            {state.runErrors.length > 0 && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-900/20">
                <p className="mb-2 text-xs font-semibold text-red-700 dark:text-red-300">
                  Logs de errores ({state.runErrors.length})
                </p>
                <div className="space-y-1">
                  {state.runErrors
                    .slice(-8)
                    .reverse()
                    .map((err, idx) => (
                      <p key={`run-error-${idx}`} className="text-xs text-red-700 dark:text-red-300">
                        [{err.stage ?? 'pipeline'}/{err.step}]
                        {err.businessName ? ` ${err.businessName}:` : ''} {err.error}
                      </p>
                    ))}
                </div>
              </div>
            )}

            {state.error && (
              <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                {state.error}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tabla de leads */}
      {state.leads.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leads ({state.leads.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[500px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Negocio</TableHead>
                    <TableHead>Teléfono</TableHead>
                    <TableHead className="text-center">Score</TableHead>
                    <TableHead>Sitio</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {state.leads.map((lead, i) => (
                    <TableRow
                      key={lead.leadId || i}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => lead.leadId && handleRowClick(lead.leadId)}
                    >
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-2">
                          {lead.businessName}
                          {loadingLead === lead.leadId && (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{lead.phone || '—'}</TableCell>
                      <TableCell className="text-center">
                        {lead.score ? (
                          <Badge variant={lead.score < 4 ? 'destructive' : 'secondary'}>
                            {lead.score}/10
                          </Badge>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        {lead.siteUrl ? (
                          <a
                            href={lead.siteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline"
                          >
                            Ver sitio
                          </a>
                        ) : lead.status === 'skipped' ? (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <SkipForward className="h-3 w-3" />
                            Omitido
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <LeadStatusBadge status={lead.status} />
                          {ACTIVE_STATUSES.includes(lead.status) && lead.updatedAt && (
                            <ElapsedTimer since={lead.updatedAt} />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-xs text-red-500">
                        {lead.error || ''}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <LeadCardModal
        lead={selectedLead}
        activity={selectedActivity}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onUpdate={(updated) => setSelectedLead(updated)}
        onAnalyze={async () => {}}
        analyzing={false}
        onGenerateSite={() => {}}
        generatingSite={false}
        onOpenWhatsApp={() => {}}
      />

      {/* Historial */}
      <PipelineHistory
        activeRunId={state.runId}
        isRunning={isRunning}
        onRerun={(pastRun) => {
          const cfg = (pastRun.config ?? {}) as Record<string, unknown>
          setNiche(pastRun.niche)
          setCity(pastRun.city)
          setMaxResults(Number(cfg.maxResults) || 20)
          setSkipAnalysis(!!cfg.skipAnalysis)
          setSkipSites(!!cfg.skipSiteGeneration)
          setSkipMessages(!!cfg.skipMessages)
          setSkipSending(!!cfg.skipSending)
          run({
            niche: pastRun.niche,
            city: pastRun.city,
            maxResults: Number(cfg.maxResults) || 20,
            skipAnalysis: !!cfg.skipAnalysis,
            skipSiteGeneration: !!cfg.skipSiteGeneration,
            skipMessages: !!cfg.skipMessages,
            skipSending: !!cfg.skipSending,
            whatsappAccountId: selectedAccountId || undefined,
          }).catch((err) => {
            toast.error(err instanceof Error ? err.message : 'Error en el pipeline')
          })
        }}
      />
    </div>
  )
}

function Stat({ label, value, error }: { label: string; value: number; error?: boolean }) {
  return (
    <div className="text-center">
      <p
        className={`text-2xl font-bold ${error && value > 0 ? 'text-red-500' : ''}`}
      >
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

function formatDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (ms < 0) return '—'
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  if (min === 0) return `${sec}s`
  return `${min}m ${sec}s`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function RunStatusBadge({ status }: { status: PipelineRun['status'] }) {
  const variants: Record<string, { label: string; className: string }> = {
    completed: {
      label: 'Completado',
      className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    },
    failed: {
      label: 'Fallido',
      className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    },
    cancelled: {
      label: 'Cancelado',
      className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    },
    running: {
      label: 'En ejecución',
      className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    },
  }
  const v = variants[status] || variants.completed
  return <Badge className={v.className}>{v.label}</Badge>
}

function PipelineHistory({
  activeRunId,
  onRerun,
  isRunning,
}: {
  activeRunId: string | null
  onRerun: (run: PipelineRun) => void
  isRunning: boolean
}) {
  const [runs, setRuns] = useState<PipelineRun[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [leadsCache, setLeadsCache] = useState<Record<string, PipelineLeadRow[]>>({})
  const [loadingLeads, setLoadingLeads] = useState<string | null>(null)

  useEffect(() => {
    const fetchRuns = () => {
      fetch('/api/pipeline')
        .then((r) => r.json())
        .then((data: PipelineRun[]) => setRuns(data))
        .catch(() => {})
    }
    fetchRuns()
    const interval = setInterval(fetchRuns, 30_000)
    return () => clearInterval(interval)
  }, [])

  const pastRuns = runs.filter(
    (r) => r.id !== activeRunId && r.status !== 'running'
  )

  const toggleExpand = async (runId: string) => {
    if (expandedId === runId) {
      setExpandedId(null)
      return
    }
    setExpandedId(runId)
    if (!leadsCache[runId]) {
      setLoadingLeads(runId)
      try {
        const res = await fetch(`/api/pipeline/leads?runId=${runId}`)
        const data = await res.json()
        setLeadsCache((prev) => ({ ...prev, [runId]: data.leads || [] }))
      } catch {
        setLeadsCache((prev) => ({ ...prev, [runId]: [] }))
      } finally {
        setLoadingLeads(null)
      }
    }
  }

  if (pastRuns.length === 0) return null

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4" />
          Historial
        </CardTitle>
        <CardDescription>Ejecuciones anteriores del pipeline.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[600px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Fecha</TableHead>
                <TableHead>Nicho</TableHead>
                <TableHead>Ciudad</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-center">Leads</TableHead>
                <TableHead className="text-center">Analizados</TableHead>
                <TableHead className="text-center">Sitios</TableHead>
                <TableHead className="text-center">Mensajes</TableHead>
                <TableHead>Duración</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pastRuns.map((run) => {
                const isExpanded = expandedId === run.id
                const leads = leadsCache[run.id]
                const runErrors = Array.isArray(run.errors) ? run.errors : []
                const endTime = run.completed_at || run.updated_at
                return (
                  <React.Fragment key={run.id}>
                    <TableRow
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => toggleExpand(run.id)}
                    >
                      <TableCell className="px-3">
                        <ChevronDown
                          className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDate(run.created_at)}
                      </TableCell>
                      <TableCell className="font-medium">{run.niche}</TableCell>
                      <TableCell>{run.city}</TableCell>
                      <TableCell>
                        <RunStatusBadge status={run.status} />
                      </TableCell>
                      <TableCell className="text-center">{run.total_leads}</TableCell>
                      <TableCell className="text-center">{run.analyzed}</TableCell>
                      <TableCell className="text-center">{run.sites_generated}</TableCell>
                      <TableCell className="text-center">{run.messages_sent}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {endTime ? formatDuration(run.created_at, endTime) : '—'}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5"
                          disabled={isRunning}
                          title={isRunning ? 'Esperá a que termine la ejecución actual' : 'Re-ejecutar con la misma configuración'}
                          onClick={(e) => {
                            e.stopPropagation()
                            onRerun(run)
                          }}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          Re-ejecutar
                        </Button>
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow>
                        <TableCell colSpan={11} className="bg-muted/30 p-0">
                          <div className="p-4">
                            {runErrors.length > 0 && (
                              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-900/20">
                                <p className="mb-2 text-xs font-semibold text-red-700 dark:text-red-300">
                                  Logs de errores ({runErrors.length})
                                </p>
                                <div className="space-y-1">
                                  {runErrors
                                    .slice(-8)
                                    .reverse()
                                    .map((err, idx) => (
                                      <p
                                        key={`${run.id}-error-${idx}`}
                                        className="text-xs text-red-700 dark:text-red-300"
                                      >
                                        [{err.stage ?? 'pipeline'}/{err.step}]
                                        {err.businessName ? ` ${err.businessName}:` : ''}{' '}
                                        {err.error}
                                      </p>
                                    ))}
                                </div>
                              </div>
                            )}

                            {loadingLeads === run.id ? (
                              <div className="flex items-center justify-center gap-2 py-6">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span className="text-sm text-muted-foreground">
                                  Cargando leads...
                                </span>
                              </div>
                            ) : leads && leads.length > 0 ? (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Negocio</TableHead>
                                    <TableHead>Teléfono</TableHead>
                                    <TableHead className="text-center">Score</TableHead>
                                    <TableHead>Sitio</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead>Error</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {leads.map((lead) => (
                                    <TableRow key={lead.id}>
                                      <TableCell className="font-medium">
                                        {lead.business_name}
                                      </TableCell>
                                      <TableCell className="text-sm">
                                        {lead.phone || '—'}
                                      </TableCell>
                                      <TableCell className="text-center">
                                        {lead.score ? (
                                          <Badge
                                            variant={
                                              lead.score < 4 ? 'destructive' : 'secondary'
                                            }
                                          >
                                            {lead.score}/10
                                          </Badge>
                                        ) : (
                                          '—'
                                        )}
                                      </TableCell>
                                      <TableCell>
                                        {lead.site_url ? (
                                          <a
                                            href={lead.site_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-sm text-primary hover:underline"
                                          >
                                            Ver sitio
                                          </a>
                                        ) : (
                                          '—'
                                        )}
                                      </TableCell>
                                      <TableCell>
                                        <LeadStatusBadge status={lead.status} />
                                      </TableCell>
                                      <TableCell className="max-w-[200px] truncate text-xs text-red-500">
                                        {lead.error || ''}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            ) : (
                              <p className="py-6 text-center text-sm text-muted-foreground">
                                No hay leads para esta ejecución.
                              </p>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
