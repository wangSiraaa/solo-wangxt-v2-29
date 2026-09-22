import type { FloatMark, LoomSpec, Mode, RecomputeResult } from '../types'

/** 行主序取值，越界返回 0 */
export function cellAt(data: ArrayLike<number>, cols: number, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= cols) return 0
  return data[y * cols + x] ?? 0
}

export function idx(x: number, y: number, cols: number): number {
  return y * cols + x
}

/**
 * 正算组织图：
 * - tie-up：纬纱 y 踩踏板 treadling[y]，穿在 shaft 上的经纱是否在上，
 *   取决于 tieup[shaft][treadle]（空穿 / 未指定踏板 => 纬浮点 0）。
 * - dobby：每一纬由 lift[y] 直接指定提起的综框。
 */
export function forwardWeave(
  mode: Mode,
  loom: LoomSpec,
  threading: ArrayLike<number>,
  treadling: ArrayLike<number>,
  tieup: ArrayLike<number>,
  lift: ArrayLike<number>
): number[] {
  const { ends, picks, shafts, treadles } = loom
  const weave = new Array<number>(ends * picks).fill(0)

  if (mode === 'tieup') {
    for (let y = 0; y < picks; y++) {
      const t = treadling[y]
      for (let x = 0; x < ends; x++) {
        const s = threading[x]
        if (s < 0 || s >= shafts || t < 0 || t >= treadles) {
          weave[y * ends + x] = 0
          continue
        }
        weave[y * ends + x] = tieup[s * treadles + t] ? 1 : 0
      }
    }
  } else {
    for (let y = 0; y < picks; y++) {
      for (let x = 0; x < ends; x++) {
        const s = threading[x]
        if (s < 0 || s >= shafts) {
          weave[y * ends + x] = 0
          continue
        }
        weave[y * ends + x] = lift[y * shafts + s] ? 1 : 0
      }
    }
  }
  return weave
}

/**
 * 浮线扫描：
 * - 经浮：同一根经纱（同一列）上连续的经浮点 (1)，横向越过若干纬纱；
 *   从组织图上看是「同一行内连续 1」？——注意视角：
 *   组织图行 = 纬纱，列 = 经纱。经纱连续被提起 = 同一列上连续多行均为 1。
 * - 纬浮：同一根纬纱（同一行）上连续的纬浮点 (0) = 同一行内连续多列为 0。
 *
 * 阈值 threshold 为组织点数：连续长度 ≥ threshold 即标记浮线上的每个格子。
 */
export function findFloats(
  weave: ArrayLike<number>,
  ends: number,
  picks: number,
  threshold: number
): FloatMark[] {
  const marks: FloatMark[] = []
  if (threshold < 2) return marks

  // 经浮：逐列扫描连续 1
  for (let x = 0; x < ends; x++) {
    let start = -1
    const flush = (endY: number) => {
      const len = endY - start
      if (start >= 0 && len >= threshold) {
        for (let y = start; y < endY; y++) marks.push({ x, y, kind: 'warp', length: len })
      }
      start = -1
    }
    for (let y = 0; y < picks; y++) {
      if (weave[y * ends + x] === 1) {
        if (start < 0) start = y
      } else flush(y)
    }
    flush(picks)
  }

  // 纬浮：逐行扫描连续 0
  for (let y = 0; y < picks; y++) {
    let start = -1
    const flush = (endX: number) => {
      const len = endX - start
      if (start >= 0 && len >= threshold) {
        for (let x = start; x < endX; x++) marks.push({ x, y, kind: 'weft', length: len })
      }
      start = -1
    }
    for (let x = 0; x < ends; x++) {
      if (weave[y * ends + x] === 0) {
        if (start < 0) start = x
      } else flush(x)
    }
    flush(ends)
  }

  return marks
}

export function recompute(
  mode: Mode,
  loom: LoomSpec,
  threading: ArrayLike<number>,
  treadling: ArrayLike<number>,
  tieup: ArrayLike<number>,
  lift: ArrayLike<number>,
  floatThreshold: number
): RecomputeResult {
  const weave = forwardWeave(mode, loom, threading, treadling, tieup, lift)
  const marks = findFloats(weave, loom.ends, loom.picks, floatThreshold)
  return { weave, marks }
}
