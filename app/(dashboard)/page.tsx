import { Users, Globe, MessageSquare, TrendingUp, Star, CheckCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createClient()

  const startOfWeek = new Date()
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
  startOfWeek.setHours(0, 0, 0, 0)

  const [leadsResult, messagesResult] = await Promise.all([
    supabase.from('leads').select('status, score'),
    supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .gte('sent_at', startOfWeek.toISOString()),
  ])

  const leads = leadsResult.data ?? []
  const totalLeads = leads.length
  const sitiosGenerados = leads.filter((l) =>
    ['sitio_generado', 'contactado', 'en_negociacion', 'cerrado'].includes(l.status)
  ).length
  const enNegociacion = leads.filter((l) => l.status === 'en_negociacion').length
  const cerrados = leads.filter((l) => l.status === 'cerrado').length
  const scoredLeads = leads.filter((l) => l.score != null)
  const avgScore =
    scoredLeads.length > 0
      ? scoredLeads.reduce((sum, l) => sum + l.score, 0) / scoredLeads.length
      : null
  const contactadosSemana = messagesResult.count ?? 0

  const stats = [
    {
      label: 'Total leads',
      value: totalLeads.toLocaleString(),
      icon: Users,
      description: 'En el CRM',
    },
    {
      label: 'Sitios generados',
      value: sitiosGenerados.toLocaleString(),
      icon: Globe,
      description: 'Propuestas creadas',
    },
    {
      label: 'Contactados esta semana',
      value: contactadosSemana.toLocaleString(),
      icon: MessageSquare,
      description: 'Mensajes enviados',
    },
    {
      label: 'En negociación',
      value: enNegociacion.toLocaleString(),
      icon: TrendingUp,
      description: 'Leads activos',
    },
    {
      label: 'Score promedio',
      value: avgScore != null ? avgScore.toFixed(1) : '—',
      icon: Star,
      description: 'De leads analizados',
    },
    {
      label: 'Cerrados / Ganados',
      value: cerrados.toLocaleString(),
      icon: CheckCircle,
      description: 'Total histórico',
    },
  ]

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Resumen general de tu pipeline de prospección.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map(({ label, value, icon: Icon, description }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{value}</div>
              <p className="mt-1 text-xs text-muted-foreground">{description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {totalLeads === 0 && (
        <div className="mt-8 rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No hay leads todavía. Importá tu primer lote para ver las métricas.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Arrancá desde el módulo{' '}
            <a
              href="/scraper"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Scraper
            </a>
          </p>
        </div>
      )}
    </div>
  )
}
