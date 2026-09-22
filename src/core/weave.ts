/**
 * 组织核心算法：正推（方案 → 组织图）、浮长分析、反推（组织图 → 方案）。
 * 全部为纯函数，可同时在主线程与 Web Worker 中运行。
 */

export interface Draft {
  shaftCount: number
  treadleCount: number
  threading: number[]
  /** tieUp[踏板][综框] */
  tieUp: boolean[][]
  treadling: number[]
}

/**
 * 组织图约定：pattern[y][x]，y = 纬纱（行，自上而下），x = 经纱（列，自左而右）。
 * true = 经组织点（经纱在上），false = 纬组织点（纬纱在上）。
 */
export type Pattern = boolean[][]

/** 由穿综 + 纹板 + 踏板顺序计算组织图 */
export function computePattern(draft: Draft): Pattern {
  const ends = draft.threading.length
  const picks = draft.treadling.length
  const pattern: Pattern = new Array(picks)
  for (let y = 0; y < picks; y++) {
    const tieRow = draft.tieUp[draft.treadling[y]]
    const row = new Array<boolean>(ends)
    for (let x = 0; x < ends; x++) {
      row[x] = tieRow ? !!tieRow[draft.threading[x]] : false
    }
    pattern[y] = row
  }
  return pattern
}

export interface FloatRun {
  /** weft = 横向连续（纬浮长），warp = 纵向连续（经浮长） */
  orientation: 'weft' | 'warp'
  x: number
  y: number
  length: number
}

/** 找出所有长度 >= minLength 的浮线（横向与纵向同值连续段） */
export function findFloats(pattern: Pattern, minLength: number): FloatRun[] {
  const runs: FloatRun[] = []
  const h = pattern.length
  const w = h > 0 ? pattern[0].length : 0
  if (w === 0 || minLength < 2) return runs

  for (let y = 0; y < h; y++) {
    let x = 0
    while (x < w) {
      let x2 = x
      while (x2 + 1 < w && pattern[y][x2 + 1] === pattern[y][x]) x2++
      const len = x2 - x + 1
      if (len >= minLength) runs.push({ orientation: 'weft', x, y, length: len })
      x = x2 + 1
    }
  }
  for (let x = 0; x < w; x++) {
    let y = 0
    while (y < h) {
      let y2 = y
      while (y2 + 1 < h && pattern[y2 + 1][x] === pattern[y][x]) y2++
      const len = y2 - y + 1
      if (len >= minLength) runs.push({ orientation: 'warp', x, y, length: len })
      y = y2 + 1
    }
  }
  return runs
}

export type SolveStatus = 'unique' | 'multiple' | 'none'

export interface SolveResult {
  status: SolveStatus
  /** status 不为 none 时给出的规范解（综框/踏板编号取分组顺序） */
  draft?: Draft
  message: string
  details: string[]
  /** 无解时：至少需要多少页综 */
  neededShafts?: number
  /** 无解时：至少需要多少个踏板 */
  neededTreadles?: number
}

/**
 * 从组织图反推穿综 / 纹板 / 踏板方案。
 *
 * 原理：两根经纱能共用一页综，当且仅当它们在组织图中的列完全相同；
 * 两根纬纱能共用一只踏板，当且仅当它们的行完全相同。
 * 因此“不同列数”是所需综框数的下界且充分，“不同行数”同理。
 *
 * 诚实的多解/无解报告：
 *  - 不同列数 > 综框数 或 不同行数 > 踏板数 → none（绝不编造数字）；
 *  - 不同列数 < 综框数（或行数 < 踏板数）→ multiple：剩余综框/踏板可任意分配，
 *    此处给出占用最少的规范解并明确说明；
 *  - 恰好相等 → unique（仅在综框/踏板编号的置换意义下唯一）。
 */
export function solveDraft(pattern: Pattern, shaftCount: number, treadleCount: number): SolveResult {
  const picks = pattern.length
  if (picks === 0) {
    return { status: 'none', message: '组织图为空，无法反推。', details: [] }
  }
  const ends = pattern[0].length
  if (ends === 0 || pattern.some((r) => r.length !== ends)) {
    return { status: 'none', message: '组织图数据不完整（行宽不一致）。', details: [] }
  }

  // 经纱按列分组
  const colGroupOf = new Array<number>(ends)
  const colGroups: number[][] = []
  const colMap = new Map<string, number>()
  for (let x = 0; x < ends; x++) {
    let key = ''
    for (let y = 0; y < picks; y++) key += pattern[y][x] ? '1' : '0'
    let g = colMap.get(key)
    if (g === undefined) {
      g = colGroups.length
      colMap.set(key, g)
      colGroups.push([])
    }
    colGroups[g].push(x)
    colGroupOf[x] = g
  }

  // 纬纱按行分组
  const rowGroupOf = new Array<number>(picks)
  const rowGroups: number[][] = []
  const rowMap = new Map<string, number>()
  for (let y = 0; y < picks; y++) {
    let key = ''
    for (let x = 0; x < ends; x++) key += pattern[y][x] ? '1' : '0'
    let g = rowMap.get(key)
    if (g === undefined) {
      g = rowGroups.length
      rowMap.set(key, g)
      rowGroups.push([])
    }
    rowGroups[g].push(y)
    rowGroupOf[y] = g
  }

  if (colGroups.length > shaftCount) {
    return {
      status: 'none',
      message: `该组织包含 ${colGroups.length} 种不同的经纱交织规律，至少需要 ${colGroups.length} 页综，当前只有 ${shaftCount} 页。`,
      details: [
        '穿综规律不同的经纱无法共用同一页综框，这不是取近似能解决的问题。',
        '可以增加综框数量，或修改组织图减少不同的经纱规律。',
      ],
      neededShafts: colGroups.length,
    }
  }
  if (rowGroups.length > treadleCount) {
    return {
      status: 'none',
      message: `该组织包含 ${rowGroups.length} 种不同的纬纱交织规律，至少需要 ${rowGroups.length} 只踏板，当前只有 ${treadleCount} 只。`,
      details: ['可以增加踏板数量，或修改组织图减少不同的纬纱规律。'],
      neededTreadles: rowGroups.length,
    }
  }

  // 构造规范解：第 g 组经纱穿第 g 页综，第 g 组纬纱用第 g 只踏板。
  // 同组列相同、同组行相同，因此每个 (行组, 列组) 块内组织点必然一致，纹板取值无冲突。
  const threading = colGroupOf.slice()
  const treadling = rowGroupOf.slice()
  const tieUp: boolean[][] = []
  for (let t = 0; t < rowGroups.length; t++) {
    const row = new Array<boolean>(colGroups.length)
    for (let s = 0; s < colGroups.length; s++) {
      row[s] = pattern[rowGroups[t][0]][colGroups[s][0]]
    }
    tieUp.push(row)
  }

  const details: string[] = []
  const spareShafts = shaftCount - colGroups.length
  const spareTreadles = treadleCount - rowGroups.length
  if (spareShafts > 0) {
    details.push(
      `实际只需 ${colGroups.length} 页综，剩余 ${spareShafts} 页综可闲置，也可把交织规律相同的经纱拆穿到多页综（改变穿综不改变织物）。`,
    )
  }
  if (spareTreadles > 0) {
    details.push(
      `实际只需 ${rowGroups.length} 只踏板，剩余 ${spareTreadles} 只可闲置，或复制纹板行后交替使用。`,
    )
  }

  if (spareShafts > 0 || spareTreadles > 0) {
    return {
      status: 'multiple',
      draft: { shaftCount, treadleCount, threading, tieUp, treadling },
      message: '该组织图对应多组等价方案，已采用占用综框/踏板最少的规范解。',
      details,
    }
  }
  return {
    status: 'unique',
    draft: { shaftCount, treadleCount, threading, tieUp, treadling },
    message: '反推成功：在综框/踏板编号置换的意义下，该组织图只有这一组方案。',
    details: [],
  }
}
