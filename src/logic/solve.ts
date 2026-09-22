import type { Alternative, LoomSpec, Mode, ReverseResult } from '../types'
import { forwardWeave } from './weave'

/**
 * 组织图反推。
 *
 * 模型（单层织物、有限综框）：
 *   weave[y][x] = tieup[ threading[x] ][ treadling[y] ]        (tie-up)
 *   weave[y][x] = lift[ y ][ threading[x] ]                    (dobby)
 *
 * 关键观察：
 * - 穿在同一综框的经纱，其组织图列向量必须完全相同；因此「列签名种类数」是
 *   所需综框数的下界，也是可实现性条件（不考虑空列：全 0 列可正常穿入某综框）。
 * - tie-up 下踩同一踏板的纬纱，其行向量必须相同（签名相同的行在二元积中
 *   对应同一右因子，这是必要条件；与规范列因子两两不同的前提组合后也是充分条件）。
 * - dobby 下一纬的提综行就是该纬行向量按列签名的展开，行之间无约束。
 *
 * 输出纪律：
 * - 只有当「列签名数 ≤ shafts」（tie-up 还要「行签名数 ≤ treadles」）才报可行；
 *   否则明确报无解与原因，绝不凑一组数。
 * - 可行时给一个规范解（签名按首次出现顺序紧凑编号），再用正算逐位验证；
 *   验证不过就视为无解，不返回未验证方案。
 * - 多解数量由标号计数给出（见下文公式），并枚举前若干个代表，同样逐一验证。
 */

/** BigInt 阶乘 */
function fact(n: number): bigint {
  let r = 1n
  for (let i = 2; i <= n; i++) r *= BigInt(i)
  return r
}

/** 排列数 P(n, k) = n!/(n-k)!：把 k 个不同对象放入 n 个可编号位置的方式数 */
function perm(n: number, k: number): bigint {
  if (k < 0 || k > n) return 0n
  let r = 1n
  for (let i = 0; i < k; i++) r *= BigInt(n - i)
  return r
}

function columnSignature(weave: number[], x: number, ends: number, picks: number): string {
  let s = ''
  for (let y = 0; y < picks; y++) s += weave[y * ends + x]
  return s
}

function rowSignature(weave: number[], y: number, ends: number): string {
  let s = ''
  for (let x = 0; x < ends; x++) s += weave[y * ends + x]
  return s
}

/** 生成 [0,n) 上的全部排列 */
function permutations(n: number): number[][] {
  if (n === 0) return [[]]
  const out: number[][] = []
  const rest = permutations(n - 1)
  for (const p of rest) {
    for (let i = 0; i <= p.length; i++) {
      const q = p.slice()
      q.splice(i, 0, n - 1)
      out.push(q)
    }
  }
  return out
}

/** 从 n 个标号位置中选 k 个的全部组合（位置升序） */
function combinations(n: number, k: number): number[][] {
  const out: number[][] = []
  const rec = (start: number, chosen: number[]) => {
    if (chosen.length === k) {
      out.push(chosen.slice())
      return
    }
    for (let i = start; i <= n - (k - chosen.length); i++) {
      chosen.push(i)
      rec(i + 1, chosen)
      chosen.pop()
    }
  }
  rec(0, [])
  return out
}

export interface ReverseInput {
  mode: Mode
  loom: LoomSpec
  weave: number[]
  /** 最多返回多少个标号解代表 */
  alternativesCap?: number
}

export function analyzeWeave(input: ReverseInput): ReverseResult {
  const { mode, loom } = input
  const cap = input.alternativesCap ?? 24
  const { ends, picks, shafts, treadles } = loom

  if (ends <= 0 || picks <= 0) {
    return infeasible(mode, 0, 0, '组织图为空，无法反推。')
  }

  // ---- 列签名 -> 紧凑列因子编号（按首次出现顺序）----
  const colSig = new Map<string, number>()
  const colFactor = new Array<number>(ends)
  for (let x = 0; x < ends; x++) {
    const sig = columnSignature(input.weave, x, ends, picks)
    let f = colSig.get(sig)
    if (f === undefined) {
      f = colSig.size
      colSig.set(sig, f)
    }
    colFactor[x] = f
  }
  const kCol = colSig.size

  if (kCol > shafts) {
    return infeasible(
      mode,
      kCol,
      0,
      `组织图中有 ${kCol} 种不同的经纱列（组织点列签名），但只有 ${shafts} 页综框；同一综框只能穿列纹完全相同的经纱，故无解。`
    )
  }

  // ---- 行签名（tie-up 才需要归并）----
  const rowSig = new Map<string, number>()
  const rowFactor = new Array<number>(picks)
  for (let y = 0; y < picks; y++) {
    const sig = rowSignature(input.weave, y, ends)
    let f = rowSig.get(sig)
    if (f === undefined) {
      f = rowSig.size
      rowSig.set(sig, f)
    }
    rowFactor[y] = f
  }
  const kRow = rowSig.size

  if (mode === 'tieup' && kRow > treadles) {
    return infeasible(
      mode,
      kCol,
      kRow,
      `组织图中有 ${kRow} 种不同的纬纱行（行签名），但只有 ${treadles} 个踏板；同一踏板踩出的各纬必须行纹相同，故无解。`
    )
  }

  // ---- 规范因子矩阵 ----
  // canonical col factors 0..kCol-1；tie-up 行因子 0..kRow-1。
  // A[f][g] 可直接从代表格读出（签名保证处处一致）。
  let tieupCanonical: number[] = new Array(shafts * treadles).fill(0)
  let liftCanonical: number[] = new Array(picks * shafts).fill(0)

  if (mode === 'tieup') {
    const a = new Array<number[]>(kCol)
    for (let f = 0; f < kCol; f++) a[f] = new Array<number>(kRow).fill(0)
    for (let y = 0; y < picks; y++) {
      for (let x = 0; x < ends; x++) {
        a[colFactor[x]][rowFactor[y]] = input.weave[y * ends + x]
      }
    }
    for (let f = 0; f < kCol; f++) {
      for (let g = 0; g < kRow; g++) {
        tieupCanonical[f * treadles + g] = a[f][g]
      }
    }
  } else {
    // dobby：第 y 提综行 = 该纬行在规范列因子下的取值向量
    for (let y = 0; y < picks; y++) {
      const v = new Array<number>(kCol).fill(0)
      for (let x = 0; x < ends; x++) v[colFactor[x]] = input.weave[y * ends + x]
      for (let f = 0; f < kCol; f++) liftCanonical[y * shafts + f] = v[f]
    }
  }

  const threadingCanonical = colFactor.slice()
  const treadlingCanonical = rowFactor.slice()

  // ---- 正算验证规范解 ----
  const canonical: Alternative = {
    threading: threadingCanonical,
    treadling: treadlingCanonical,
    tieup: tieupCanonical,
    lift: liftCanonical,
    verified: false
  }
  canonical.verified = verify(input.weave, mode, loom, canonical)
  if (!canonical.verified) {
    return infeasible(mode, kCol, kRow, '规范解正算校验失败（内部一致性检查未通过），按无解处理。')
  }

  // ---- 标号解计数 ----
  // 未使用的综框/踏板允许与使用中的任意标号交换而不改变织物——它们确实是不同的
  // 穿综/纹板方案（编号不同），因此计入「方案多解」，但物理上等价。
  let labeledCount: bigint
  let explanation: string
  let enumFactory: () => Alternative[]

  if (mode === 'tieup') {
    // 列因子到 shafts 个综框编号的单射：P(shafts, kCol)
    // 行因子到 treadles 个踏板编号的单射：P(treadles, kRow)
    const pCol = perm(shafts, kCol)
    const pRow = perm(treadles, kRow)
    labeledCount = pCol * pRow
    explanation =
      `织构上需要 ${kCol} 页综框、${kRow} 个踏板。` +
      `${kCol} 个不同的列因子分配到 ${shafts} 页综框有 P(${shafts},${kCol})=${pCol} 种编号方式；` +
      `${kRow} 个不同的行因子分配到 ${treadles} 个踏板有 P(${treadles},${kRow})=${pRow} 种；` +
      `两者独立，共 ${pCol} × ${pRow} = ${labeledCount} 种穿综/纹板标号方案，织出的组织图完全相同。`
    enumFactory = () =>
      enumerateTieup(
        mode,
        loom,
        input.weave,
        threadingCanonical,
        treadlingCanonical,
        tieupCanonical,
        kCol,
        kRow,
        cap
      )
  } else {
    // 只有列重标号：P(shafts, kCol)；每一纬的提综向量随行重写，行无归并。
    const pCol = perm(shafts, kCol)
    labeledCount = pCol
    explanation =
      `多臂（dobby）模式下提综由纹板逐纬指定，行不需要归并踏板；` +
      `${kCol} 个列因子分配到 ${shafts} 页综框有 P(${shafts},${kCol})=${pCol} 种编号方式，` +
      `共 ${pCol} 种等效穿综/纹板方案。`
    enumFactory = () =>
      enumerateDobby(
        mode,
        loom,
        input.weave,
        threadingCanonical,
        liftCanonical,
        kCol,
        cap
      )
  }

  const alternatives = enumFactory()
  const truncated = BigInt(alternatives.length) < labeledCount

  return {
    feasible: true,
    mode,
    shaftsNeeded: kCol,
    treadlesNeeded: kRow,
    canonical,
    labeledCount: labeledCount.toString(),
    countExplanation: explanation,
    alternatives,
    alternativesTruncated: truncated
  }
}

function infeasible(
  mode: Mode,
  shaftsNeeded: number,
  treadlesNeeded: number,
  reason: string
): ReverseResult {
  return {
    feasible: false,
    mode,
    shaftsNeeded,
    treadlesNeeded,
    reason,
    alternatives: [],
    alternativesTruncated: false
  }
}

function verify(
  target: number[],
  mode: Mode,
  loom: LoomSpec,
  alt: Alternative
): boolean {
  const got = forwardWeave(mode, loom, alt.threading, alt.treadling, alt.tieup, alt.lift)
  if (got.length !== target.length) return false
  for (let i = 0; i < target.length; i++) if (got[i] !== target[i]) return false
  return true
}

/** tie-up 标号解枚举（限量），每个都过正算验证 */
function enumerateTieup(
  mode: Mode,
  loom: LoomSpec,
  target: number[],
  threadingCanonical: number[],
  treadlingCanonical: number[],
  tieupCanonical: number[],
  kCol: number,
  kRow: number,
  cap: number
): Alternative[] {
  const out: Alternative[] = []
  const { shafts, treadles } = loom

  // 选取被使用的综框编号集合 / 踏板编号集合，再乘上因子排列。
  const shaftPos = combinations(shafts, kCol)
  const treadlePos = combinations(treadles, kRow)
  const colPerms = permutations(kCol)
  const rowPerms = permutations(kRow)

  outer: for (const sp of shaftPos) {
    for (const tp of treadlePos) {
      for (const cp of colPerms) {
        for (const rp of rowPerms) {
          // 因子 f -> 实际综框编号 sp[cp[f]]；因子 g -> 实际踏板 tp[rp[g]]
          const threading = threadingCanonical.map((f) => sp[cp[f]])
          const treadling = treadlingCanonical.map((g) => tp[rp[g]])
          const tieup = new Array<number>(shafts * treadles).fill(0)
          for (let f = 0; f < kCol; f++) {
            for (let g = 0; g < kRow; g++) {
              tieup[sp[cp[f]] * treadles + tp[rp[g]]] =
                tieupCanonical[f * treadles + g]
            }
          }
          const alt: Alternative = { threading, treadling, tieup, lift: [], verified: false }
          alt.verified = verify(target, mode, loom, alt)
          out.push(alt)
          if (out.length >= cap) break outer
        }
      }
    }
  }
  return out
}

/** dobby 标号解枚举（限量） */
function enumerateDobby(
  mode: Mode,
  loom: LoomSpec,
  target: number[],
  threadingCanonical: number[],
  liftCanonical: number[],
  kCol: number,
  cap: number
): Alternative[] {
  const out: Alternative[] = []
  const { shafts, picks } = loom
  const shaftPos = combinations(shafts, kCol)
  const colPerms = permutations(kCol)

  outer: for (const sp of shaftPos) {
    for (const cp of colPerms) {
      const threading = threadingCanonical.map((f) => sp[cp[f]])
      const lift = new Array<number>(picks * shafts).fill(0)
      for (let y = 0; y < picks; y++) {
        for (let f = 0; f < kCol; f++) {
          lift[y * shafts + sp[cp[f]]] = liftCanonical[y * shafts + f]
        }
      }
      const alt: Alternative = {
        threading,
        treadling: [],
        tieup: [],
        lift,
        verified: false
      }
      alt.verified = verify(target, mode, loom, alt)
      out.push(alt)
      if (out.length >= cap) break outer
    }
  }
  return out
}

/** 供 UI 显示「等价类之外的真实自由度提示」：固定空编号后的简化计数 */
export function equivalenceNote(r: ReverseResult): string {
  if (!r.feasible) return ''
  const upToRelabel =
    r.mode === 'tieup'
      ? fact(r.shaftsNeeded) * fact(r.treadlesNeeded)
      : fact(r.shaftsNeeded)
  return (
    `若把综框/踏板的重新编号视为同一种织构方案（仅看织物），` +
    `本质织构唯一；按编号区分则有 ${r.labeledCount} 种（含未用综框/踏板的换号 ${upToRelabel} 因子的对称等价）。`
  )
}
