import { NextResponse } from 'next/server'
import { expectedToken, AUTH_COOKIE } from '../../../lib/auth/token'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const { password } = (await req.json().catch(() => ({}))) as { password?: string }
  const expected = process.env.APP_PASSWORD

  if (!expected) return NextResponse.json({ error: 'No password configured' }, { status: 500 })
  if (password !== expected) {
    return NextResponse.json({ error: 'Wrong password' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(AUTH_COOKIE, expectedToken(expected), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  return res
}
