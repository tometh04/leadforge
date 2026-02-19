import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface ScoreBadgeProps {
  score: number | null
  size?: 'sm' | 'md' | 'lg'
}

export function ScoreBadge({ score, size = 'md' }: ScoreBadgeProps) {
  if (score === null || score === undefined) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Sin analizar
      </Badge>
    )
  }

  const isCritical = score <= 4
  const isImproving = score >= 5 && score <= 6
  const isAcceptable = score >= 7

  return (
    <Badge
      className={cn(
        'font-bold tabular-nums',
        size === 'sm' && 'text-xs px-1.5 py-0',
        size === 'lg' && 'text-base px-3 py-1',
        isCritical && 'bg-red-100 text-red-700 border-red-200 hover:bg-red-100',
        isImproving && 'bg-yellow-100 text-yellow-700 border-yellow-200 hover:bg-yellow-100',
        isAcceptable && 'bg-green-100 text-green-700 border-green-200 hover:bg-green-100'
      )}
      variant="outline"
    >
      {isCritical && '🔴 '}
      {isImproving && '🟡 '}
      {isAcceptable && '🟢 '}
      {score}/10
    </Badge>
  )
}
