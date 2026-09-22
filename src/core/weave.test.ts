import { describe, expect, it } from 'vitest'
import { computePattern, findFloats, solveDraft } from './weave'
import { plainWeaveDraft, satinPattern, twillDraft } from './presets'

describe('computePattern（正推）', () => {
  it('平纹组织点交替', () => {
    const p = computePattern(plainWeaveDraft(4, 4))
    expect(p).toEqual([
      [true, false, true, false],
      [false, true, false, true],
      [true, false, true, false],
      [false, true, false, true],
    ])
  })

  it('2/2 斜纹每行连续两个经组织点', () => {
    const p = computePattern(twillDraft(8, 8))
    for (const row of p) {
      const ups = row.filter(Boolean).length
      expect(ups).toBe(4) // 8 根经纱中一半在上
    }
  })
})

describe('solveDraft（反推）', () => {
  it('平纹在 2 综 2 踏板下唯一可解', () => {
    const d = plainWeaveDraft(8, 8)
    const res = solveDraft(computePattern(d), 2, 2)
    expect(res.status).toBe('unique')
    expect(computePattern(res.draft!)).toEqual(computePattern(d))
  })

  it('综框有富余时如实报告多解，且给出的规范解能复现组织', () => {
    const d = plainWeaveDraft(8, 8)
    const res = solveDraft(computePattern(d), 4, 4)
    expect(res.status).toBe('multiple')
    expect(computePattern(res.draft!)).toEqual(computePattern(d))
    expect(res.details.length).toBeGreaterThan(0)
  })

  it('八枚缎纹在 4 综下无解，并报告需要 8 综', () => {
    const res = solveDraft(satinPattern(8, 3, 16, 16), 4, 8)
    expect(res.status).toBe('none')
    expect(res.neededShafts).toBe(8)
    expect(res.draft).toBeUndefined()
  })

  it('八枚缎纹在 8 综 8 踏板下可解且复现组织', () => {
    const pat = satinPattern(8, 3, 16, 16)
    const res = solveDraft(pat, 8, 8)
    expect(res.status).toBe('unique')
    expect(computePattern(res.draft!)).toEqual(pat)
  })

  it('斜纹正推再反推可以还原组织', () => {
    const d = twillDraft(12, 12)
    const res = solveDraft(computePattern(d), 4, 4)
    expect(res.status).toBe('unique')
    expect(computePattern(res.draft!)).toEqual(computePattern(d))
  })

  it('踏板不足时报告无解', () => {
    const pat = satinPattern(8, 3, 16, 16)
    const res = solveDraft(pat, 8, 4)
    expect(res.status).toBe('none')
    expect(res.neededTreadles).toBe(8)
  })

  it('拒绝空组织图', () => {
    expect(solveDraft([], 4, 4).status).toBe('none')
  })
})

describe('findFloats（浮长分析）', () => {
  it('检出横向长浮线', () => {
    const runs = findFloats([[true, true, true, true, true, false]], 5)
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({ orientation: 'weft', x: 0, y: 0, length: 5 })
  })

  it('检出纵向长浮线', () => {
    const pat = [
      [true, true],
      [false, true],
      [true, true],
      [false, true],
      [true, true],
    ]
    const runs = findFloats(pat, 5)
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({ orientation: 'warp', x: 1, y: 0, length: 5 })
  })

  it('平纹没有长浮线', () => {
    const p = computePattern(plainWeaveDraft(16, 16))
    expect(findFloats(p, 5)).toHaveLength(0)
  })
})
