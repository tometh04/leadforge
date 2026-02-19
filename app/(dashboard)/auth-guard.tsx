import { requireAuth } from '@/lib/auth/verify-session'

/** Server component — verifica sesión HMAC antes de renderizar el dashboard */
export default async function AuthGuard({ children }: { children: React.ReactNode }) {
  await requireAuth()
  return <>{children}</>
}
