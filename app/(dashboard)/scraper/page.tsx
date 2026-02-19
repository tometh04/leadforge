'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Search,
  Import,
  ExternalLink,
  Star,
  CheckCircle2,
  AlertCircle,
  History,
  RotateCcw,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScraperResult, ScraperSearch } from '@/types'

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

const MAX_RESULTS_OPTIONS = [10, 20, 30, 50]

export default function ScraperPage() {
  const [niche, setNiche] = useState('')
  const [city, setCity] = useState('')
  const [maxResults, setMaxResults] = useState(20)
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [results, setResults] = useState<ScraperResult[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [searched, setSearched] = useState(false)
  const [activeTab, setActiveTab] = useState('buscar')
  const [history, setHistory] = useState<ScraperSearch[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true)
    try {
      const res = await fetch('/api/scraper/history')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setHistory(data)
    } catch {
      toast.error('Error al cargar el historial')
    } finally {
      setLoadingHistory(false)
    }
  }, [])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  const handleSearch = async () => {
    if (!niche.trim() || !city.trim()) {
      toast.error('Completá el nicho y la ciudad')
      return
    }
    setLoading(true)
    setResults([])
    setSelected(new Set())
    setSearched(false)

    try {
      const res = await fetch('/api/scraper/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ niche: niche.trim(), city: city.trim(), maxResults }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setResults(data.results)
      setSearched(true)

      if (data.results.length === 0) {
        toast.info('No se encontraron leads con teléfono y website en esa búsqueda')
      } else {
        toast.success(`${data.total} leads encontrados — ${data.new} nuevos`)
      }

      // Refrescar historial después de una búsqueda exitosa
      fetchHistory()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al buscar')
    } finally {
      setLoading(false)
    }
  }

  const handleReSearch = (search: ScraperSearch) => {
    setNiche(search.niche)
    setCity(search.city)
    setMaxResults(search.max_results)
    setActiveTab('buscar')
    // Ejecutar la búsqueda después de cambiar de tab
    setTimeout(() => {
      document.getElementById('search-btn')?.click()
    }, 100)
  }

  const handleImport = async () => {
    const toImport = results.filter((r) => selected.has(r.place_id) && !r.already_imported)
    if (toImport.length === 0) {
      toast.warning('No hay leads nuevos seleccionados para importar')
      return
    }

    setImporting(true)
    try {
      const res = await fetch('/api/scraper/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads: toImport, niche: niche.trim(), city: city.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      toast.success(`${data.imported} leads importados al CRM`)

      // Marcar como importados en la UI
      setResults((prev) =>
        prev.map((r) => (selected.has(r.place_id) ? { ...r, already_imported: true } : r))
      )
      setSelected(new Set())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al importar')
    } finally {
      setImporting(false)
    }
  }

  const toggleSelect = (placeId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(placeId)) next.delete(placeId)
      else next.add(placeId)
      return next
    })
  }

  const toggleAll = () => {
    const selectableIds = results.filter((r) => !r.already_imported).map((r) => r.place_id)
    if (selected.size === selectableIds.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(selectableIds))
    }
  }

  const selectableCount = results.filter((r) => !r.already_imported).length
  const allSelected = selected.size === selectableCount && selectableCount > 0

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Scraper de leads</h1>
        <p className="text-muted-foreground">
          Buscá negocios por nicho y ciudad. Solo trae resultados con teléfono y website.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="buscar" className="gap-1.5">
            <Search className="h-4 w-4" />
            Buscar
          </TabsTrigger>
          <TabsTrigger value="historial" className="gap-1.5">
            <History className="h-4 w-4" />
            Historial
          </TabsTrigger>
        </TabsList>

        <TabsContent value="buscar">
          {/* Formulario de búsqueda */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="text-base">Nueva búsqueda</CardTitle>
              <CardDescription>
                Usamos Google Places para encontrar negocios con presencia web.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="niche">Nicho</Label>
                  <div className="flex gap-2">
                    <Input
                      id="niche"
                      placeholder="ej. Dentistas, Gimnasios..."
                      value={niche}
                      onChange={(e) => setNiche(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    />
                    <Select onValueChange={(v) => setNiche(v)}>
                      <SelectTrigger className="w-36 shrink-0">
                        <SelectValue placeholder="Predefinidos" />
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

                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="city">Ciudad / Zona</Label>
                  <Input
                    id="city"
                    placeholder="ej. Palermo, Buenos Aires..."
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  />
                </div>

                <div className="w-32 space-y-1.5">
                  <Label>Máx. resultados</Label>
                  <Select
                    value={String(maxResults)}
                    onValueChange={(v) => setMaxResults(Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MAX_RESULTS_OPTIONS.map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  id="search-btn"
                  onClick={handleSearch}
                  disabled={loading}
                  className="h-10 gap-2"
                >
                  <Search className="h-4 w-4" />
                  {loading ? 'Buscando...' : 'Buscar leads'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Resultados */}
          {loading && <LoadingSkeleton />}

          {!loading && searched && results.length === 0 && (
            <div className="rounded-lg border border-dashed p-12 text-center">
              <AlertCircle className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="font-medium">Sin resultados</p>
              <p className="mt-1 text-sm text-muted-foreground">
                No se encontraron negocios con teléfono y sitio web en esa búsqueda. Probá con otro
                nicho o ciudad.
              </p>
            </div>
          )}

          {!loading && results.length > 0 && (
            <div>
              {/* Acciones de la tabla */}
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    {results.length} resultados —{' '}
                    <span className="font-medium text-foreground">{selectableCount} nuevos</span>
                  </span>
                  {selected.size > 0 && (
                    <Badge variant="secondary">{selected.size} seleccionados</Badge>
                  )}
                </div>
                <Button
                  onClick={handleImport}
                  disabled={importing || selected.size === 0}
                  className="gap-2"
                >
                  <Import className="h-4 w-4" />
                  {importing
                    ? 'Importando...'
                    : `Importar ${selected.size > 0 ? selected.size : ''} al CRM`}
                </Button>
              </div>

              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleAll}
                          className="h-4 w-4 cursor-pointer rounded border-border"
                          title="Seleccionar todos los nuevos"
                        />
                      </TableHead>
                      <TableHead>Negocio</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead>Teléfono</TableHead>
                      <TableHead>Website</TableHead>
                      <TableHead className="text-center">Rating</TableHead>
                      <TableHead className="text-center">Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((lead) => (
                      <TableRow
                        key={lead.place_id}
                        className={lead.already_imported ? 'opacity-50' : 'cursor-pointer'}
                        onClick={() => !lead.already_imported && toggleSelect(lead.place_id)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selected.has(lead.place_id)}
                            onChange={() =>
                              !lead.already_imported && toggleSelect(lead.place_id)
                            }
                            disabled={lead.already_imported}
                            className="h-4 w-4 cursor-pointer rounded border-border disabled:cursor-not-allowed"
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            {lead.google_photo_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={lead.google_photo_url}
                                alt={lead.business_name}
                                className="h-8 w-8 rounded-md object-cover"
                              />
                            ) : (
                              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-xs font-bold text-muted-foreground">
                                {lead.business_name.charAt(0)}
                              </div>
                            )}
                            <div>
                              <p className="font-medium leading-tight">{lead.business_name}</p>
                              <p className="text-xs text-muted-foreground">{lead.address}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {lead.category}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{lead.phone}</TableCell>
                        <TableCell>
                          <a
                            href={lead.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1 text-sm text-primary hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            {new URL(lead.website).hostname.replace('www.', '')}
                          </a>
                        </TableCell>
                        <TableCell className="text-center">
                          {lead.rating ? (
                            <span className="flex items-center justify-center gap-1 text-sm">
                              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                              {lead.rating}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {lead.already_imported ? (
                            <Badge variant="secondary" className="gap-1 text-xs">
                              <CheckCircle2 className="h-3 w-3" />
                              En CRM
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              Nuevo
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="historial">
          {loadingHistory && <LoadingSkeleton />}

          {!loadingHistory && history.length === 0 && (
            <div className="rounded-lg border border-dashed p-12 text-center">
              <History className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="font-medium">Sin búsquedas previas</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Las búsquedas que realices aparecerán acá.
              </p>
            </div>
          )}

          {!loadingHistory && history.length > 0 && (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Nicho</TableHead>
                    <TableHead>Ciudad</TableHead>
                    <TableHead className="text-center">Encontrados</TableHead>
                    <TableHead className="text-center">Nuevos</TableHead>
                    <TableHead className="text-center">Viables</TableHead>
                    <TableHead className="text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((search) => (
                    <TableRow key={search.id}>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(search.created_at).toLocaleDateString('es-AR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </TableCell>
                      <TableCell className="font-medium">{search.niche}</TableCell>
                      <TableCell>{search.city}</TableCell>
                      <TableCell className="text-center">{search.total_found}</TableCell>
                      <TableCell className="text-center">{search.new_found}</TableCell>
                      <TableCell className="text-center">{search.viable}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => handleReSearch(search)}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Re-buscar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-lg" />
      ))}
    </div>
  )
}
