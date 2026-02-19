'use client'

import { useState, useEffect, useCallback } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { Lead, LeadActivity, LeadStatus } from '@/types'
import { ScoreBadge } from '@/components/leads/ScoreBadge'
import { LeadCardModal } from '@/components/leads/LeadCardModal'
import { WhatsAppModal } from '@/components/leads/WhatsAppModal'
import { Star, Phone, ExternalLink, RefreshCw, Loader2, Zap } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'

const COLUMNS: { id: LeadStatus; label: string; color: string; dot: string }[] = [
  { id: 'nuevo',          label: 'Nuevo',          color: 'border-t-slate-400',  dot: 'bg-slate-400' },
  { id: 'analizado',      label: 'Analizado',      color: 'border-t-blue-400',   dot: 'bg-blue-400' },
  { id: 'candidato',      label: 'Candidato',      color: 'border-t-orange-400', dot: 'bg-orange-400' },
  { id: 'sitio_generado', label: 'Sitio generado', color: 'border-t-purple-400', dot: 'bg-purple-400' },
  { id: 'contactado',     label: 'Contactado',     color: 'border-t-cyan-400',   dot: 'bg-cyan-400' },
  { id: 'en_negociacion', label: 'En negociación', color: 'border-t-yellow-400', dot: 'bg-yellow-400' },
  { id: 'cerrado',        label: 'Cerrado ✓',      color: 'border-t-green-400',  dot: 'bg-green-400' },
  { id: 'descartado',     label: 'Descartado',     color: 'border-t-red-400',    dot: 'bg-red-400' },
]

export default function KanbanPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)

  // Modal state
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [activity, setActivity] = useState<LeadActivity[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [analyzing, setAnalyzing] = useState<string | null>(null)
  const [generatingSite, setGeneratingSite] = useState<Set<string>>(new Set())
  const [whatsappLead, setWhatsappLead] = useState<Lead | null>(null)
  const [bulkAnalyzing, setBulkAnalyzing] = useState(false)

  const fetchLeads = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/leads?limit=200')
      const data = await res.json()
      setLeads(data.leads ?? [])
    } catch {
      toast.error('Error al cargar los leads')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchLeads() }, [fetchLeads])

  /* ── DRAG & DROP ── */
  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result
    if (!destination) return
    if (destination.droppableId === source.droppableId && destination.index === source.index) return

    const newStatus = destination.droppableId as LeadStatus

    // Optimistic update
    setLeads((prev) =>
      prev.map((l) => (l.id === draggableId ? { ...l, status: newStatus } : l))
    )
    setSelectedLead((prev) =>
      prev?.id === draggableId ? { ...prev, status: newStatus } : prev
    )

    try {
      const res = await fetch(`/api/leads/${draggableId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error()
      toast.success(`→ ${COLUMNS.find((c) => c.id === newStatus)?.label}`)
    } catch {
      toast.error('Error al guardar el cambio')
      fetchLeads()
    }
  }

  /* ── OPEN MODAL ── */
  const openModal = async (lead: Lead) => {
    setSelectedLead(lead)
    setModalOpen(true)
    const res = await fetch(`/api/leads/${lead.id}/activity`)
    const data = await res.json()
    setActivity(Array.isArray(data) ? data : [])
  }

  const closeModal = () => {
    setModalOpen(false)
    setTimeout(() => setSelectedLead(null), 300)
  }

  /* ── ANALYZE ── */
  const handleAnalyze = async (lead: Lead) => {
    setAnalyzing(lead.id)
    try {
      const res = await fetch(`/api/analyze/${lead.id}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      toast.success(`Score: ${data.score}/10 — ${data.status === 'candidato' ? '🎯 Candidato!' : 'Analizado'}`)

      const patch = {
        score: data.score,
        score_details: data.details,
        score_summary: data.details.summary,
        status: data.status as LeadStatus,
      }
      setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, ...patch } : l)))
      if (selectedLead?.id === lead.id) {
        setSelectedLead((prev) => prev ? { ...prev, ...patch } : prev)
        const actRes = await fetch(`/api/leads/${lead.id}/activity`)
        setActivity(await actRes.json())
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al analizar')
    } finally {
      setAnalyzing(null)
    }
  }

  /* ── BULK ANALYZE ── */
  const handleBulkAnalyze = async () => {
    const pending = leads.filter((l) => !l.score && l.status === 'nuevo')
    if (pending.length === 0) { toast.info('No hay leads nuevos sin analizar'); return }
    setBulkAnalyzing(true)
    toast.info(`Analizando ${pending.length} leads...`)
    let done = 0
    for (const lead of pending) {
      try { await fetch(`/api/analyze/${lead.id}`, { method: 'POST' }); done++ } catch { /* continuar */ }
    }
    toast.success(`✅ ${done}/${pending.length} leads analizados`)
    setBulkAnalyzing(false)
    fetchLeads()
  }

  /* ── GENERATE SITE ── */
  const handleGenerateSite = (lead: Lead) => {
    setGeneratingSite((prev) => new Set(prev).add(lead.id))
    toast.info(`Generando sitio para ${lead.business_name}...`)

    fetch(`/api/generate-site/${lead.id}`, { method: 'POST' })
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        toast.success(`🌐 Sitio generado para ${lead.business_name}`)

        const leadRes = await fetch(`/api/leads/${lead.id}`)
        const updated = await leadRes.json()
        setLeads((prev) => prev.map((l) => (l.id === lead.id ? updated : l)))
        if (selectedLead?.id === lead.id) {
          setSelectedLead(updated)
          const actRes = await fetch(`/api/leads/${lead.id}/activity`)
          setActivity(await actRes.json())
        }
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Error al generar sitio')
      })
      .finally(() => {
        setGeneratingSite((prev) => {
          const next = new Set(prev)
          next.delete(lead.id)
          return next
        })
      })
  }

  /* ── UPDATE LEAD ── */
  const handleLeadUpdate = (updated: Lead) => {
    setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))
    setSelectedLead(updated)
  }

  const byStatus = (status: LeadStatus) => leads.filter((l) => l.status === status)
  const pendingCount = leads.filter((l) => !l.score && l.status === 'nuevo').length

  /* ── LOADING STATE ── */
  if (loading) {
    return (
      <div className="p-8">
        <h1 className="mb-6 text-2xl font-bold">Kanban</h1>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((col) => (
            <div key={col.id} className="w-64 shrink-0">
              <Skeleton className="mb-3 h-8 w-full" />
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="mb-2 h-28 w-full rounded-xl" />
              ))}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col">
      {/* ── HEADER ── */}
      <div className="border-b px-8 py-5 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Pipeline</h1>
            <p className="text-sm text-muted-foreground">
              {leads.length} leads — arrastrá para mover · click para ver detalle
            </p>
          </div>
          <div className="flex items-center gap-2">
            {pendingCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={handleBulkAnalyze}
                disabled={bulkAnalyzing}
              >
                {bulkAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                Analizar {pendingCount} pendientes
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={fetchLeads} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Actualizar
            </Button>
          </div>
        </div>
      </div>

      {/* ── BOARD ── */}
      <div className="flex-1 overflow-x-auto">
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex h-full gap-3 p-5">
            {COLUMNS.map((col) => {
              const colLeads = byStatus(col.id)
              return (
                <div key={col.id} className={`flex w-64 shrink-0 flex-col rounded-t-lg border-t-2 ${col.color}`}>
                  {/* Column header */}
                  <div className="flex items-center justify-between px-2 pb-2 pt-3">
                    <div className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full shrink-0 ${col.dot}`} />
                      <span className="text-sm font-semibold">{col.label}</span>
                    </div>
                    <Badge variant="secondary" className="tabular-nums text-xs">
                      {colLeads.length}
                    </Badge>
                  </div>

                  {/* Droppable */}
                  <Droppable droppableId={col.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`flex flex-1 flex-col gap-2 rounded-b-lg p-2 transition-colors min-h-24 ${
                          snapshot.isDraggingOver
                            ? 'bg-primary/5 ring-1 ring-inset ring-primary/20'
                            : 'bg-muted/20'
                        }`}
                      >
                        {colLeads.map((lead, index) => (
                          <Draggable key={lead.id} draggableId={lead.id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                onClick={() => !snapshot.isDragging && openModal(lead)}
                                className={`rounded-xl border bg-card px-3 py-2.5 shadow-sm transition-all cursor-pointer select-none ${
                                  snapshot.isDragging
                                    ? 'shadow-xl rotate-1 opacity-90 cursor-grabbing scale-105'
                                    : 'hover:shadow-md hover:border-primary/30 active:scale-[0.98]'
                                } ${selectedLead?.id === lead.id && modalOpen ? 'ring-2 ring-primary/50' : ''}`}
                              >
                                {/* Card header: avatar + name */}
                                <div className="mb-2 flex items-start gap-2">
                                  {lead.google_photo_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={lead.google_photo_url}
                                      alt=""
                                      className="h-8 w-8 rounded-lg object-cover shrink-0"
                                    />
                                  ) : (
                                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary shrink-0">
                                      {lead.business_name.charAt(0)}
                                    </div>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-xs font-semibold leading-tight">
                                      {lead.business_name}
                                    </p>
                                    <p className="truncate text-xs text-muted-foreground">
                                      {lead.category}
                                    </p>
                                  </div>
                                </div>

                                {/* Score badge */}
                                <ScoreBadge score={lead.score} size="sm" />

                                {/* Quick info */}
                                <div className="mt-2 space-y-0.5">
                                  {lead.phone && (
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                      <Phone className="h-2.5 w-2.5 shrink-0" />
                                      <span className="truncate">{lead.phone}</span>
                                    </div>
                                  )}
                                  {lead.website && (
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                      <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                                      <span className="truncate">
                                        {(() => { try { return new URL(lead.website).hostname.replace('www.', '') } catch { return lead.website } })()}
                                      </span>
                                    </div>
                                  )}
                                  {lead.rating && (
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                      <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400 shrink-0" />
                                      {lead.rating}
                                    </div>
                                  )}
                                </div>

                                {/* Badges */}
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {lead.generated_site_url && (
                                    <span className="inline-flex items-center gap-0.5 rounded-full bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                                      🌐 Sitio listo
                                    </span>
                                  )}
                                  {(analyzing === lead.id || generatingSite.has(lead.id)) && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">
                                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                      {analyzing === lead.id ? 'Analizando' : 'Generando'}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}

                        {colLeads.length === 0 && !snapshot.isDraggingOver && (
                          <div className="flex flex-1 items-center justify-center py-8 text-xs text-muted-foreground/40 italic">
                            Vacío
                          </div>
                        )}
                      </div>
                    )}
                  </Droppable>
                </div>
              )
            })}
          </div>
        </DragDropContext>
      </div>

      {/* ── MODAL DETALLE (estilo Trello) ── */}
      <LeadCardModal
        lead={selectedLead}
        activity={activity}
        open={modalOpen}
        onClose={closeModal}
        onUpdate={handleLeadUpdate}
        onAnalyze={() => selectedLead ? handleAnalyze(selectedLead) : Promise.resolve()}
        analyzing={analyzing === selectedLead?.id}
        onGenerateSite={() => { if (selectedLead) handleGenerateSite(selectedLead) }}
        generatingSite={!!selectedLead && generatingSite.has(selectedLead.id)}
        onOpenWhatsApp={() => selectedLead && setWhatsappLead(selectedLead)}
      />

      {/* ── MODAL WHATSAPP ── */}
      <WhatsAppModal
        lead={whatsappLead}
        open={!!whatsappLead}
        onClose={() => setWhatsappLead(null)}
        onSent={(updated) => {
          if (whatsappLead) {
            handleLeadUpdate({ ...whatsappLead, ...updated } as Lead)
          }
        }}
      />
    </div>
  )
}
