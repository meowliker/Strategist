import { describe, it, expect } from 'vitest'
import { parseTaskName } from '../src/lib/parse/taskName'

// Every fixture below is a real task name taken from the live workspace.
describe('parseTaskName', () => {
  it('parses the standard CODE-SERIAL-INS form', () => {
    const p = parseTaskName('AT-126-INS-063')
    expect(p.productCode).toBe('AT')
    expect(p.serial).toBe(126)
    expect(p.inspirationId).toBe('063')
    expect(p.variations).toEqual([])
    expect(p.changedLever).toBeNull()
  })

  it('extracts a single variation and its lever', () => {
    const p = parseTaskName('AR-189-INS-059 - V3 - Full Remake')
    expect(p.baseName).toBe('AR-189-INS-059')
    expect(p.variations).toEqual([{ index: 3, lever: 'Full Remake' }])
    expect(p.changedLever).toBe('Full Remake')
  })

  it('extracts a nested variation chain in order', () => {
    const p = parseTaskName('9645-2 - V5 - Custom - V4 - CTA')
    expect(p.variations).toEqual([
      { index: 5, lever: 'Custom' },
      { index: 4, lever: 'CTA' },
    ])
    // The last link in the chain is what this task actually tested.
    expect(p.changedLever).toBe('CTA')
  })

  it('keeps levers that contain their own hyphens intact', () => {
    const p = parseTaskName('NC-017-INS-014 - V4 - Change body ( Clip after the hook )')
    expect(p.changedLever).toBe('Change body ( Clip after the hook )')
    expect(p.variations).toHaveLength(1)
  })

  it('pulls bracketed lineage ids out of the lever text', () => {
    const p = parseTaskName('PHONICS - 13423 - V3 - Production Style [13898]')
    expect(p.changedLever).toBe('Production Style')
    expect(p.legacyIds).toEqual([13423, 13898])
  })

  it('collects multiple legacy creative ids', () => {
    const p = parseTaskName('KL - 12991/9821 (2 winner) - V16 - PS - V2 - Hook')
    expect(p.legacyIds).toEqual([9821, 12991])
    expect(p.changedLever).toBe('Hook')
  })

  it('does not mistake 3-digit serials for legacy ids', () => {
    const p = parseTaskName('AT-126-INS-063')
    expect(p.legacyIds).toEqual([])
  })

  it('parses the IGB angle scheme', () => {
    const p = parseTaskName('IGB-FR-VID-01')
    expect(p.igbAngle).toBe('FR')
    expect(p.igbAssetType).toBe('VID')
    expect(p.productCode).toBe('IGB')
  })

  it('parses the IGB ICP scheme', () => {
    expect(parseTaskName('IGB-ICP1-A').icpMarker).toBe('ICP1-A')
  })

  it('flags legacy winner annotations', () => {
    expect(parseTaskName('10168-1 winner P old').hasLegacyWinnerNote).toBe(false)
    expect(parseTaskName('8981-2 old winner').hasLegacyWinnerNote).toBe(true)
    expect(parseTaskName('11991-1 new winner').hasLegacyWinnerNote).toBe(true)
  })

  it('survives names with no convention at all', () => {
    const p = parseTaskName('NEW CONCEPT (PHOTO 2)')
    expect(p.productCode).toBeNull()
    expect(p.legacyIds).toEqual([])
    expect(p.baseName).toBe('NEW CONCEPT (PHOTO 2)')
  })

  it('handles the irregular spacing seen in CA-12495 -2-INS-041', () => {
    const p = parseTaskName('CA-12495 -2-INS-041')
    expect(p.inspirationId).toBe('041')
    expect(p.legacyIds).toEqual([12495])
  })
})
