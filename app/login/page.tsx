'use client'

import { useState, FormEvent, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Zap, Loader2 } from 'lucide-react'

// Componente separado para aislar useSearchParams (requiere Suspense en build de producción)
function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const from = searchParams.get('from') ?? '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Credenciales incorrectas')
        return
      }

      router.push(from)
      router.refresh()
    } catch {
      setError('Error de conexión. Intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-xl border bg-card p-7 shadow-sm space-y-5">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email */}
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tomas@leadforge.com"
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
          />
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm font-medium">
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
          />
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Ingresando…
            </>
          ) : (
            'Entrar'
          )}
        </button>
      </form>
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">

        {/* Logo + título */}
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary shadow-md">
              <Zap className="h-5 w-5 text-primary-foreground" />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">LeadForge</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Ingresá para acceder al dashboard
            </p>
          </div>
        </div>

        {/* Form envuelto en Suspense (requerido por useSearchParams en producción) */}
        <Suspense fallback={
          <div className="rounded-xl border bg-card p-7 shadow-sm h-[220px] animate-pulse" />
        }>
          <LoginForm />
        </Suspense>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground/60">
          LeadForge v0.1 · Uso privado
        </p>
      </div>
    </div>
  )
}
