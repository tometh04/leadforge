'use client'

import { useState, useEffect } from 'react'
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
import type { PipelineStage, PipelineLeadState } from '@/types'

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

function stageIndex(stage: PipelineStage): number {
  const idx = STAGES.findIndex((s) => s.key === stage)
  if (stage === 'done') return STAGES.length
  return idx
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
  const { state, run, cancel, isRunning, reset } = usePipeline()
  const [niche, setNiche] = useState('')
  const [city, setCity] = useState('')
  const [maxResults, setMaxResults] = useState(20)
  const [skipAnalysis, setSkipAnalysis] = useState(false)
  const [skipSites, setSkipSites] = useState(false)
  const [skipMessages, setSkipMessages] = useState(false)
  const [skipSending, setSkipSending] = useState(false)
  const [whatsappPaired, setWhatsappPaired] = useState<boolean | null>(null)

  useEffect(() => {
    fetch('/api/whatsapp/status')
      .then((r) => r.json())
      .then((d) => setWhatsappPaired(d.paired))
      .catch(() => setWhatsappPaired(false))
  }, [])

  const handleRun = async () => {
    if (!niche.trim() || !city.trim()) {
      toast.error('Completá el nicho y la ciudad')
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
      })
      toast.success('Pipeline completado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error en el pipeline')
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

      {/* WhatsApp warning */}
      {whatsappPaired === false && !skipSending && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-yellow-300 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20">
          <AlertTriangle className="h-5 w-5 shrink-0 text-yellow-600 dark:text-yellow-400" />
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              WhatsApp no está vinculado
            </p>
            <p className="text-xs text-yellow-700 dark:text-yellow-300">
              El envío de mensajes no funcionará.{' '}
              <a href="/whatsapp" className="underline">
                Vincular ahora
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

            <div className="flex items-end">
              {isRunning ? (
                <Button variant="destructive" onClick={cancel} className="w-full gap-2">
                  <XCircle className="h-4 w-4" />
                  Cancelar
                </Button>
              ) : state.stage === 'done' || state.stage === 'error' ? (
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
                const isActive = s.key === state.stage
                const isComplete = currentStageIdx > i
                const isError = state.stage === 'error' && currentStageIdx === i

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
                    <TableRow key={lead.leadId || i}>
                      <TableCell className="font-medium">{lead.businessName}</TableCell>
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
                        <LeadStatusBadge status={lead.status} />
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
