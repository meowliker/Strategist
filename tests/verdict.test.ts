import { describe, it, expect } from 'vitest'
import { compareField, compareAll, countMismatches, normalise, FIELD_SPECS } from '../src/lib/analysis/verdict'

const spec = (field: string) => FIELD_SPECS.find((s) => s.field === field)!

describe('normalise', () => {
  it('collapses spacing and case drift', () => {
    expect(normalise('Hook+Offer')).toBe(normalise('Hook + Offer'))
    expect(normalise('Tutorial / How-To')).toBe(normalise('tutorial/how-to'))
  })
  it('treats blanks and em-dashes as absent', () => {
    expect(normalise('—')).toBeNull()
    expect(normalise('   ')).toBeNull()
    expect(normalise(null)).toBeNull()
  })
})

describe('compareField', () => {
  it('matches when both agree despite formatting', () => {
    const r = compareField({ spec: spec('creative_structure'), claimed: 'Hook+Offer', observed: 'Hook + Offer', confidence: 0.9, evidence: null })
    expect(r.verdict).toBe('match')
    expect(r.resolved).toBe('Hook+Offer')
  })

  it('flags a confident objective disagreement as a mismatch and prefers the creative', () => {
    const r = compareField({ spec: spec('ad_type'), claimed: 'Video', observed: 'Photo', confidence: 0.98, evidence: 'single still frame, no motion' })
    expect(r.verdict).toBe('mismatch')
    expect(r.resolved).toBe('Photo')
  })

  it('fills a blank ClickUp field from the creative', () => {
    const r = compareField({ spec: spec('production_style'), claimed: null, observed: 'Static Graphic', confidence: 0.9, evidence: null })
    expect(r.verdict).toBe('missing')
    expect(r.resolved).toBe('Static Graphic')
  })

  it('does not fill a blank field from a low-confidence guess', () => {
    const r = compareField({ spec: spec('production_style'), claimed: null, observed: 'Polished UGC', confidence: 0.3, evidence: null })
    expect(r.verdict).toBe('missing')
    expect(r.resolved).toBeNull()
  })

  it('records an interpretive divergence as two views, not an error', () => {
    const r = compareField({ spec: spec('persona'), claimed: 'Stressed Women 25-45', observed: 'Adult Women With ADHD', confidence: 0.9, evidence: 'female narrator, ADHD language on screen' })
    expect(r.verdict).toBe('differs')
    // The human's value stays authoritative — a model cannot prove intent —
    // but both readings are kept so the team can compare them.
    expect(r.resolved).toBe('Stressed Women 25-45')
    expect(r.observed).toBe('Adult Women With ADHD')
  })

  it('matches an interpretive field when both readings agree', () => {
    const r = compareField({ spec: spec('angle'), claimed: 'Free Bundle / Offer-Led', observed: 'free bundle / offer-led', confidence: 0.9, evidence: null })
    expect(r.verdict).toBe('match')
  })

  it('never marks an interpretive field a mismatch, however confident', () => {
    const r = compareField({ spec: spec('angle'), claimed: 'Value Stack', observed: 'Monetization', confidence: 1, evidence: null })
    expect(r.verdict).not.toBe('mismatch')
    expect(r.verdict).toBe('differs')
  })

  it('downgrades a low-confidence objective disagreement rather than calling it wrong', () => {
    const r = compareField({ spec: spec('creative_structure'), claimed: 'Demo', observed: 'Tutorial / How-To', confidence: 0.4, evidence: null })
    expect(r.verdict).toBe('unverifiable')
    expect(r.resolved).toBe('Demo')
  })

  it('keeps the claim when nothing was observed', () => {
    const r = compareField({ spec: spec('hook_type'), claimed: 'Curiosity', observed: null, confidence: null, evidence: null })
    expect(r.verdict).toBe('unverifiable')
    expect(r.resolved).toBe('Curiosity')
  })

  it('reports nothing on both sides as unverifiable, not a match', () => {
    const r = compareField({ spec: spec('funnel'), claimed: null, observed: null, confidence: null, evidence: null })
    expect(r.verdict).toBe('unverifiable')
    expect(r.resolved).toBeNull()
  })
})

describe('compareAll', () => {
  it('counts only genuine contradictions as mismatches', () => {
    const fields = compareAll(
      { ad_type: 'Video', creative_structure: 'Demo', persona: 'Women 25-45', hook_type: null },
      { ad_type: 'Photo', creative_structure: 'Demo', persona: 'Men 30-50', hook_type: 'Curiosity' },
      { ad_type: 0.98, creative_structure: 0.9, persona: 0.95, hook_type: 0.85 },
    )
    // Only ad_type is a real mismatch: structure agrees, persona is interpretive,
    // and hook_type was simply absent from ClickUp.
    expect(countMismatches(fields)).toBe(1)
    expect(fields.find((f) => f.field === 'hook_type')!.verdict).toBe('missing')
    expect(fields.find((f) => f.field === 'persona')!.verdict).toBe('differs')
  })

  it('returns a row for every spec', () => {
    expect(compareAll({}, {})).toHaveLength(FIELD_SPECS.length)
  })
})
