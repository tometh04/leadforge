import { NextRequest, NextResponse } from 'next/server'

// Rutas que NO requieren autenticación
const PUBLIC_PREFIXES = [
  '/login',
  '/api/auth/login',
  '/preview',
  '/_next',
  '/favicon.ico',
]

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Pasar rutas públicas sin verificar
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Verificar existencia de la cookie — validación HMAC se hace en el server
  const sessionToken = req.cookies.get('leadforge_session')?.value

  if (!sessionToken) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
