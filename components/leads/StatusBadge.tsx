import { Badge } from '@/components/ui/badge'
import { LeadStatus } from '@/types'
import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<LeadStatus, { label: string; className: string }> = {
  nuevo: { label: 'Nuevo', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  analizado: { label: 'Analizado', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  candidato: { label: 'Candidato', className: 'bg-orange-100 text-orange-700 border-orange-200' },
  sitio_generado: { label: 'Sitio generado', className: 'bg-purple-100 text-purple-700 border-purple-200' },
  contactado: { label: 'Contactado', className: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
  en_negociacion: { label: 'En negociación', className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  cerrado: { label: 'Cerrado ✓', className: 'bg-green-100 text-green-700 border-green-200' },
  descartado: { label: 'Descartado', className: 'bg-red-100 text-red-700 border-red-200' },
}

interface StatusBadgeProps {
  status: LeadStatus
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? { label: status, className: '' }
  return (
    <Badge
      variant="outline"
      className={cn('text-xs font-medium', config.className, className)}
    >
      {config.label}
    </Badge>
  )
}

export const STATUS_LABELS = STATUS_CONFIG
