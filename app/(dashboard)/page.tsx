import { Users, Globe, MessageSquare, TrendingUp, Star, CheckCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const stats = [
  {
    label: 'Total leads',
    value: '—',
    icon: Users,
    description: 'En el CRM',
  },
  {
    label: 'Sitios generados',
    value: '—',
    icon: Globe,
    description: 'Propuestas creadas',
  },
  {
    label: 'Contactados esta semana',
    value: '—',
    icon: MessageSquare,
    description: 'Mensajes enviados',
  },
  {
    label: 'En negociación',
    value: '—',
    icon: TrendingUp,
    description: 'Leads activos',
  },
  {
    label: 'Score promedio',
    value: '—',
    icon: Star,
    description: 'De leads analizados',
  },
  {
    label: 'Cerrados / Ganados',
    value: '—',
    icon: CheckCircle,
    description: 'Total histórico',
  },
]

export default function DashboardPage() {
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

      <div className="mt-8 rounded-lg border border-dashed p-8 text-center">
        <p className="text-muted-foreground text-sm">
          Las métricas se actualizarán cuando conectes Supabase y empieces a importar leads.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Arrancá desde el módulo{' '}
          <a href="/scraper" className="font-medium text-primary underline-offset-4 hover:underline">
            Scraper
          </a>
        </p>
      </div>
    </div>
  )
}
