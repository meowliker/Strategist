import { NextResponse, type NextRequest } from 'next/server'

/**
 * Password gate.
 *
 * Everything behind this is competitive intelligence — winning hooks, angles,
 * spend-adjacent judgements and links into a private Drive. Deployed without a
 * gate the whole thing sits on a public URL for anyone who guesses it, so the
 * app refuses to serve rather than expose it silently when APP_PASSWORD is unset
 * in production.
 *
 * A single shared password is the smallest thing that genuinely protects this.
 * Per-person accounts via Supabase Auth are the upgrade when you want to know
 * who looked at what.
 */
import { expectedToken, AUTH_COOKIE } from './lib/auth/token'

const PUBLIC_PATHS = ['/login', '/api/login', '/_next', '/favicon']

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next()

  const password = process.env.APP_PASSWORD
  if (!password) {
    // Locally this is a convenience; in production it would be a data leak.
    if (process.env.NODE_ENV === 'production') {
      return new NextResponse(
        'APP_PASSWORD is not set. Refusing to serve this dashboard unauthenticated.',
        { status: 503 },
      )
    }
    return NextResponse.next()
  }

  if (req.cookies.get(AUTH_COOKIE)?.value === expectedToken(password)) return NextResponse.next()

  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.searchParams.set('next', pathname)
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
