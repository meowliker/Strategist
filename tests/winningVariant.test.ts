import { describe, it, expect } from 'vitest'
import { winningVariant } from '../src/lib/parse/winningVariant'

// Every fixture is real text taken from the live workspace.
describe('winningVariant', () => {
  it('reads "# Winner: TASK-1"', () => {
    expect(winningVariant('# Winner: HHH - 13605-1\n📄 Creative Brief: ...')).toBe(1)
  })

  it('reads "# Winner - TASK-2"', () => {
    expect(winningVariant('# Winner - CA-211-INS-040-2\n# https://drive.google.com/file/d/xyz/view')).toBe(2)
  })

  it('reads a WINNER VIDEO heading followed by the file link', () => {
    const d = 'WINNER VIDEO\n[https://t90.clickup-attachments.com/t90/08cde064/13469-1.mp4?view=open](https://x)'
    expect(winningVariant(d)).toBe(1)
  })

  it('reads "V01 is winner"', () => {
    expect(winningVariant('**V01 is winner**\n\n📋 CREATIVE BRIEF')).toBe(1)
  })

  it('reads "Winner variation - AD-012-INS-002-1"', () => {
    expect(winningVariant('Winner variation - AD-012-INS-002-1')).toBe(1)
  })

  it('ignores prose about a different creative', () => {
    expect(winningVariant('Changing the hook video of winner 12050')).toBeNull()
    expect(winningVariant('convert winner of canva into ADHD')).toBeNull()
  })

  it('ignores a brief-table row that merely tags a field as winner', () => {
    expect(winningVariant('| Persona | Adult Women With ADHD⭐ Winner |')).toBeNull()
  })

  it('returns null when two different variants are both claimed', () => {
    expect(winningVariant('# Winner: X-1\nAlso winner: Y-3')).toBeNull()
  })

  it('returns null for no note at all', () => {
    expect(winningVariant('📋 CREATIVE BRIEF\n| Angle | Curiosity |')).toBeNull()
    expect(winningVariant(null)).toBeNull()
  })

  it('agrees with itself when the same variant is named twice', () => {
    expect(winningVariant('# Winner: HHH - 13605-1\nWinner video - 13605-1')).toBe(1)
  })
})
