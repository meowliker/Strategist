import { describe, it, expect } from 'vitest'
import { parseBrief } from '../src/lib/parse/brief'

// Verbatim description from task TH-100-INS-075.
const FULL = `📋 CREATIVE BRIEF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Field | Value |
|---|---|
| Angle | Emotional Pain / Trauma |
| Persona | Budget-Blocked Women 25-40 |
| Funnel | TOF |
| Ad Type | Photo |
| Hook Type | Direct Offer |
| Creative Structure | Hook + Offer |
| Production Style | Static Graphic |
| Inspiration Link | [https://drive.google.com/drive/folders/1IiL](https://drive.google.com/drive/folders/1IiL) |

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧠 Creative Hypothesis
The ad was made to qualify parents who want measurable academic advantage.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 Inspiration Brief: [https://app.clickup.com/9016762494/docs/abc](https://app.clickup.com/9016762494/docs/abc)
🔗 Source Ad: [https://drive.google.com/drive/folders/1IiL](https://drive.google.com/drive/folders/1IiL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 Notes: Light blue vertical static image with bold black text.`

// Verbatim description from variation task AT-126-INS-063 - V1.
const VARIATION = `**V01 is winner**

📋 CREATIVE BRIEF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Field | Value |
|---|---|
| Angle | Scarcity / Limited-Time Offer |
| Persona | Stressed Women 25-45 |
| Funnel | TOF |
| Ad Type | Photo |

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔁 Variation of: AT-126-INS-063
🔗 Parent Task: [https://app.clickup.com/t/86d2zuexw](https://app.clickup.com/t/86d2zuexw)
📋 Changes: Production Style
📝 Notes: New content , except the middle one will be same`

describe('parseBrief', () => {
  it('reads every field of a full brief table', () => {
    const b = parseBrief(FULL)
    expect(b.angle).toBe('Emotional Pain / Trauma')
    expect(b.persona).toBe('Budget-Blocked Women 25-40')
    expect(b.funnel).toBe('TOF')
    expect(b.adType).toBe('Photo')
    expect(b.hookType).toBe('Direct Offer')
    expect(b.creativeStructure).toBe('Hook + Offer')
    expect(b.productionStyle).toBe('Static Graphic')
  })

  it('unwraps markdown links to bare urls', () => {
    const b = parseBrief(FULL)
    expect(b.inspirationLink).toBe('https://drive.google.com/drive/folders/1IiL')
    expect(b.inspirationBriefUrl).toBe('https://app.clickup.com/9016762494/docs/abc')
    expect(b.sourceAdUrl).toBe('https://drive.google.com/drive/folders/1IiL')
  })

  it('captures the hypothesis without the divider', () => {
    expect(parseBrief(FULL).hypothesis).toBe(
      'The ad was made to qualify parents who want measurable academic advantage.',
    )
  })

  it('reads notes', () => {
    expect(parseBrief(FULL).notes).toBe('Light blue vertical static image with bold black text.')
  })

  it('reads variation lineage', () => {
    const b = parseBrief(VARIATION)
    expect(b.variationOf).toBe('AT-126-INS-063')
    expect(b.parentTaskUrl).toBe('https://app.clickup.com/t/86d2zuexw')
    expect(b.changes).toBe('Production Style')
  })

  it('leaves fields absent from a partial brief as null', () => {
    const b = parseBrief(VARIATION)
    expect(b.hookType).toBeNull()
    expect(b.creativeStructure).toBeNull()
    expect(b.productionStyle).toBeNull()
  })

  it('returns an empty brief for a missing description', () => {
    const b = parseBrief(null)
    expect(b.angle).toBeNull()
    expect(b.extra).toEqual({})
  })
})
