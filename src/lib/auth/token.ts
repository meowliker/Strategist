/**
 * Cookie value derived from the shared password.
 *
 * Kept out of middleware.ts because Next.js allows only `middleware` and
 * `config` to be exported from that file — anything else breaks the build.
 * Deriving a token also keeps the password itself out of the cookie.
 */
export function expectedToken(password: string): string {
  let h = 0
  const salt = 'strategist.v1'
  for (const ch of salt + password) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0
  return `t${(h >>> 0).toString(36)}`
}

export const AUTH_COOKIE = 'strategist_auth'
