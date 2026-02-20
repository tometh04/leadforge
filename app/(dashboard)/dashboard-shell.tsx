'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, Search, Kanban, Zap, LogOut, Rocket, MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/scraper', label: 'Scraper', icon: Search },
  { href: '/kanban', label: 'Pipeline', icon: Kanban },
  { href: '/autopilot', label: 'Autopilot', icon: Rocket },
  { href: '/whatsapp', label: 'WhatsApp', icon: MessageCircle },
]

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* ── SIDEBAR ── */}
      <aside className="flex w-56 shrink-0 flex-col border-r bg-card">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 py-5 border-b">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary shrink-0">
            <Zap className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          <span className="text-sm font-bold tracking-tight">LeadForge</span>
        </div>

        {/* Nav */}
        <nav className="flex flex-1 flex-col gap-0.5 p-3">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== '/' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                  active
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Footer con logout */}
        <div className="border-t p-3 space-y-1">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-all"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Cerrar sesión
          </button>
          <p className="px-3 text-[11px] text-muted-foreground/60 font-medium tracking-wide uppercase">v0.1 beta</p>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main className="flex-1 min-w-0 overflow-auto">
        {children}
      </main>
    </div>
  )
}
