import { requireAuth } from '@/lib/auth/verify-session'
import DashboardShell from './dashboard-shell'

// Server Component — verifica sesión HMAC antes de renderizar cualquier página del dashboard
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth()
  return <DashboardShell user={user}>{children}</DashboardShell>
}
