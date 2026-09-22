import type { Draft, Pattern } from './weave'

/** 平纹：2 综 2 踏板 */
export function plainWeaveDraft(ends: number, picks: number): Draft {
  const threading = Array.from({ length: ends }, (_, i) => i % 2)
  const treadling = Array.from({ length: picks }, (_, i) => i % 2)
  const tieUp = [
    [true, false],
    [false, true],
  ]
  return { shaftCount: 2, treadleCount: 2, threading, tieUp, treadling }
}

/** 2/2 右斜纹：4 综 4 踏板 */
export function twillDraft(ends: number, picks: number): Draft {
  const threading = Array.from({ length: ends }, (_, i) => i % 4)
  const treadling = Array.from({ length: picks }, (_, i) => i % 4)
  const tieUp: boolean[][] = []
  for (let t = 0; t < 4; t++) {
    const row = [false, false, false, false]
    row[t] = true
    row[(t + 1) % 4] = true
    tieUp.push(row)
  }
  return { shaftCount: 4, treadleCount: 4, threading, tieUp, treadling }
}

/**
 * 八枚缎纹组织图（飞数 3）：需要 8 页综。
 * 用作“超过综框能力”的演示——在综框数 < 8 时反推会如实报告无解。
 */
export function satinPattern(size = 8, move = 3, ends = 16, picks = 16): Pattern {
  const pattern: Pattern = []
  for (let y = 0; y < picks; y++) {
    const row = new Array<boolean>(ends)
    for (let x = 0; x < ends; x++) {
      row[x] = (((x - move * y) % size) + size) % size === 0
    }
    pattern.push(row)
  }
  return pattern
}
