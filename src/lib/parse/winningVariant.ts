/**
 * Finds which single variation of a task actually won.
 *
 * The team notes this by hand in the description, in several shapes:
 *   "# Winner: HHH - 13605-1"        → variant 1
 *   "# Winner - CA-211-INS-040-2"    → variant 2
 *   "WINNER VIDEO" + a .../13469-1.mp4 link on the next line → variant 1
 *   "**V01 is winner**"              → variant 1
 *
 * When one is found the pipeline reads only that file from Drive instead of all
 * three, which cuts the cost of those tasks by roughly two thirds.
 *
 * Deliberately conservative: an ambiguous note returns null and every variant is
 * read. Spending a little more is far better than analysing the wrong file and
 * attributing a loser's hook to a winner.
 */

const WINNER_LINE = /winner/i

/** "V01 is winner", "V2 is the winner" */
const V_IS_WINNER = /\bV0?(\d{1,2})\b[^\n]{0,24}?\bis\b[^\n]{0,18}?winner/i

/** "Winner: SOMETHING-2", "Winner - SOMETHING-2", "Winner variation - X-1" */
const WINNER_SUFFIX = /winner\b[^\n]{0,30}?[A-Za-z0-9)][ .]*-\s*(\d{1,2})\s*(?:$|[^\d\w-])/i

/** A media filename carrying the variant suffix, e.g. 13469-1.mp4 */
const FILE_SUFFIX = /[A-Za-z0-9][A-Za-z0-9 ._()%-]*?-(\d{1,2})\.(?:mp4|mov|m4v|webm|jpg|jpeg|png)\b/i

export function winningVariant(description: string | null | undefined): number | null {
  if (!description) return null

  const lines = description.split('\n')
  const found = new Set<number>()

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\*\*/g, '').replace(/\\/g, '').trim()
    if (!WINNER_LINE.test(line)) continue

    // Skip brief-table rows and prose that merely reference another winner —
    // "Changing the hook video of winner 12050" is about a different creative.
    if (/\|/.test(line) && /Field|Angle|Persona|Funnel/i.test(line)) continue

    const v = line.match(V_IS_WINNER) ?? line.match(WINNER_SUFFIX)
    if (v) { found.add(Number(v[1])); continue }

    // "WINNER VIDEO" on its own line, with the file on the next line.
    if (/^#*\s*winner\b[\s:.-]*(video)?\s*$/i.test(line)) {
      const next = (lines[i + 1] ?? '').replace(/\\/g, '')
      const f = next.match(FILE_SUFFIX)
      if (f) found.add(Number(f[1]))
    }
  }

  // Two different variants claimed as the winner is a contradiction; read all.
  if (found.size !== 1) return null
  const only = [...found][0]
  return only >= 1 && only <= 20 ? only : null
}
