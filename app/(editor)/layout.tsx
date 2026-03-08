import { requireAuth } from '@/lib/auth/verify-session'

export default async function EditorLayout({ children }: { children: React.ReactNode }) {
  await requireAuth()
  return <>{children}</>
}
