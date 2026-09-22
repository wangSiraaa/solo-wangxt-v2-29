import type { LoomSpec, Mode, WeaveProject } from './types'
import { FORMAT_ID, FORMAT_VERSION } from './types'

/**
 * 内置教学样例：
 * - plain：平纹，2 综 2 踏，列签名 2 种，可行；
 * - twill：2/2 斜纹，4 综 4 踏，列签名 4 种，可行且多解；
 * - overcap：8 纬 × 6 经中出现 6 种互异列签名，而只有 4 页综框 → 反推必须报无解。
 *
 * 颜色与组织点结构分开存放：weave 只记录谁上谁下，颜色全部在 colors 中。
 */

const WARP_A = '#b4332a' // 经纱 胭脂红
const WARP_B = '#8c241d'
const WEFT_A = '#2f4b7c' // 纬纱 靛蓝
const WEFT_B = '#22335a'

function blank(spec: LoomSpec) {
  return {
    threading: new Array(spec.ends).fill(-1),
    treadling: new Array(spec.picks).fill(-1),
    tieup: new Array(spec.shafts * spec.treadles).fill(0),
    lift: new Array(spec.picks * spec.shafts).fill(0),
    weave: new Array(spec.ends * spec.picks).fill(0)
  }
}

function makeProject(
  name: string,
  mode: Mode,
  spec: LoomSpec,
  parts: Partial<ReturnType<typeof blank>>,
  handEdited: boolean,
  warpColors?: string[],
  weftColors?: string[]
): WeaveProject {
  const b = blank(spec)
  const now = Date.now()
  return {
    format: FORMAT_ID,
    version: FORMAT_VERSION,
    name,
    createdAt: now,
    updatedAt: now,
    mode,
    loom: spec,
    threading: parts.threading ?? b.threading,
    treadling: parts.treadling ?? b.treadling,
    tieup: parts.tieup ?? b.tieup,
    lift: parts.lift ?? b.lift,
    weave: parts.weave ?? b.weave,
    handEdited,
    colors: {
      warp: warpColors ?? new Array(spec.ends).fill(WARP_A),
      weft: weftColors ?? new Array(spec.picks).fill(WEFT_A),
      background: '#f4efe6'
    },
    floatThreshold: 4
  }
}

/** 平纹：1/1，2 页综 2 个踏板 */
export function plainWeave(): WeaveProject {
  const spec: LoomSpec = { shafts: 2, treadles: 2, ends: 8, picks: 8 }
  const threading: number[] = []
  const treadling: number[] = []
  for (let i = 0; i < 8; i++) {
    threading.push(i % 2)
    treadling.push(i % 2)
  }
  const tieup = [
    1, 0,
    0, 1
  ]
  return makeProject(
    '平纹 1/1（2 综 2 踏）',
    'tieup',
    spec,
    { threading, treadling, tieup },
    false,
    Array.from({ length: 8 }, (_, i) => (i % 2 ? WARP_B : WARP_A)),
    Array.from({ length: 8 }, (_, i) => (i % 2 ? WEFT_B : WEFT_A))
  )
}

/** 2/2 斜纹：顺穿顺踏，吊综连续两个对角点 */
export function twillWeave(): WeaveProject {
  const spec: LoomSpec = { shafts: 4, treadles: 4, ends: 12, picks: 12 }
  const threading: number[] = []
  const treadling: number[] = []
  for (let i = 0; i < 12; i++) {
    threading.push(i % 4)
    treadling.push(i % 4)
  }
  const tieup = new Array(spec.shafts * spec.treadles).fill(0)
  for (let f = 0; f < 4; f++) {
    for (let t = 0; t < 4; t++) {
      // 2/2 斜纹吊综：踏板 t 提起连续两页综（t、t+1 模 4），
      // 配合顺穿顺踏得到每行/列严格 1100 循环。
      const d = (t - f + 4) % 4
      if (d === 0 || d === 3) tieup[f * 4 + t] = 1
    }
  }
  return makeProject(
    '2/2 斜纹（4 综 4 踏）',
    'tieup',
    spec,
    { threading, treadling, tieup },
    false,
    Array.from({ length: 12 }, (_, i) => (i % 4 < 2 ? WARP_A : '#c2572b')),
    Array.from({ length: 12 }, () => WEFT_A)
  )
}

/** 由列字符串数组（每串长度 = picks）转成行主序组织图 */
function fromColumns(cols: string[]): { weave: number[]; ends: number; picks: number } {
  const ends = cols.length
  const picks = cols[0].length
  const weave = new Array<number>(ends * picks).fill(0)
  for (let x = 0; x < ends; x++) {
    for (let y = 0; y < picks; y++) {
      weave[y * ends + x] = cols[x][y] === '1' ? 1 : 0
    }
  }
  return { weave, ends, picks }
}

/**
 * 超出综框能力的例子：6 种互异列签名 > 4 页综框。
 * 组织图手绘给出，穿综/纹板故意留空，等待反推给出「无解」结论。
 */
export function overCapacityWeave(): WeaveProject {
  const cols = [
    '11001100',
    '10101010',
    '10010010',
    '11100110',
    '01100110',
    '00011100'
  ]
  const { weave, ends, picks } = fromColumns(cols)
  const spec: LoomSpec = { shafts: 4, treadles: 4, ends, picks }
  const warpColors = ['#b4332a', '#c2572b', '#dca938', '#3f7d4e', '#2f4b7c', '#6a3d8a']
  return makeProject(
    '超综框能力样例（6 种列纹 / 4 综）',
    'tieup',
    spec,
    { weave },
    true,
    warpColors,
    new Array(picks).fill('#4a5a6e')
  )
}

export interface PresetInfo {
  key: string
  label: string
  hint: string
  build: () => WeaveProject
}

export const PRESETS: PresetInfo[] = [
  {
    key: 'plain',
    label: '平纹',
    hint: '1/1 平纹，2 综 2 踏。编辑穿综或纹板后组织图自动重算。',
    build: plainWeave
  },
  {
    key: 'twill',
    label: '2/2 斜纹',
    hint: '4 综 4 踏顺穿。从组织图反推可看到多解（综框/踏板重新编号）。',
    build: twillWeave
  },
  {
    key: 'overcap',
    label: '超综框能力',
    hint: '6 种列纹但只有 4 页综框，反推必须报告无解，而不是凑一组方案。',
    build: overCapacityWeave
  }
]
