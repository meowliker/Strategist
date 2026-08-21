import { describe, it, expect } from 'vitest'
import { folderIdFromUrl, variantIndex } from '../src/lib/drive/client'

describe('folderIdFromUrl', () => {
  it('reads a folder url, the shape ClickUp actually stores', () => {
    expect(folderIdFromUrl('https://drive.google.com/drive/folders/15ObCmOa09RcV1n3QnSDcE1pQP5fjbj_w'))
      .toBe('15ObCmOa09RcV1n3QnSDcE1pQP5fjbj_w')
  })
  it('reads a file url', () => {
    expect(folderIdFromUrl('https://drive.google.com/file/d/1uGt2M-cfNBiNUG_NyQK13zDnkiI6TyBP/view?usp=drivesdk'))
      .toBe('1uGt2M-cfNBiNUG_NyQK13zDnkiI6TyBP')
  })
  it('reads an id query param', () => {
    expect(folderIdFromUrl('https://drive.google.com/open?id=1IiLMVMelk7REJjjDs9JuRDwrRKLgOOQV'))
      .toBe('1IiLMVMelk7REJjjDs9JuRDwrRKLgOOQV')
  })
  it('returns null for junk or empty values', () => {
    expect(folderIdFromUrl(null)).toBeNull()
    expect(folderIdFromUrl('https://example.com/nope')).toBeNull()
  })
})

describe('variantIndex', () => {
  it('reads the hook-variant suffix from real export names', () => {
    expect(variantIndex('CA-285-INS-110-1.mp4')).toBe(1)
    expect(variantIndex('CA-285-INS-110-3.mp4')).toBe(3)
    expect(variantIndex('KL-380-INS-138-2.mov')).toBe(2)
  })
  it('returns null when there is no suffix', () => {
    expect(variantIndex('AT-126-INS-063.mp4')).toBeNull()
  })
  it('does not treat a long trailing number as a variant', () => {
    expect(variantIndex('13898-2 winner.mp4')).toBeNull()
  })
})
