/**
 * 织造工作室核心数据模型
 *
 * 约定：
 * - 经向（warp）为水平方向：列 x ∈ [0, ends)，自上而下的穿综图每一列对应一根经纱。
 * - 纬向（weft）为垂直方向：行 y ∈ [0, picks)，纹板/多臂图的每一行对应一根纬纱。
 * - 组织图 weave[y][x] = 1 表示经浮点（经纱在上），0 表示纬浮点。
 *
 * 所有一维数组均为逐行展平（row-major）的纯 number[]，便于 Worker 结构化克隆。
 */

export type Mode = 'tieup' | 'dobby'

export interface LoomSpec {
  /** 综框数（shafts），列签名种类超过此值则反推无解 */
  shafts: number
  /** 踏板数（treadles），仅 tie-up 模式使用；行签名种类超过此值则无解 */
  treadles: number
  /** 经纱根数（纹帘列数） */
  ends: number
  /** 纬纱根数（纹板行数） */
  picks: number
}

export interface Colors {
  /** 每根经纱的颜色（长度 ends） */
  warp: string[]
  /** 每根纬纱的颜色（长度 picks） */
  weft: string[]
  /** 背景色 */
  background: string
}

export interface WeaveProject {
  /** 数据格式版本，导回时校验 */
  format: 'weave-studio-json'
  version: 1
  id?: number
  name: string
  createdAt: number
  updatedAt: number
  mode: Mode
  loom: LoomSpec

  /**
   * 穿综图：threading[x] = 综框序号（0 起）。
   * tie-up 模式下 -1 表示空穿；dobby 模式同样允许空穿。
   */
  threading: number[]
  /**
   * 纹板踩踏方案（tie-up 模式）：treadling[y] = 踏板序号（0 起），-1 表示未指定。
   */
  treadling: number[]
  /**
   * 吊综关系（tie-up 模式）：[shaft][treadle] = 1/0，行主序，长度 shafts*treadles。
   * 踩下某踏板时，所有与其相连的综框被提起。
   */
  tieup: number[]
  /**
   * 多臂提综方案（dobby 模式）：[y][shaft] = 1/0，行主序，长度 picks*shafts。
   * 每一纬直接指定提起哪些综框。
   */
  lift: number[]

  /** 组织图：[y][x]，行主序 */
  weave: number[]
  /**
   * true 表示组织图被手绘修改过（或由外部导入/切换模式保留），
   * 与当前穿综/纹板可能不一致，需要反推才能恢复方案。
   */
  handEdited: boolean

  colors: Colors
  /** 浮线高亮阈值：连续同性质组织点 ≥ 该值才算浮线（2 表示从相邻两点起算） */
  floatThreshold: number
}

/** 一个单元格上的浮线信息 */
export interface FloatMark {
  x: number
  y: number
  /** warp = 经浮（横向连续经浮点），weft = 纬浮（纵向连续纬浮点） */
  kind: 'warp' | 'weft'
  /** 该浮线的连续长度（组织点数） */
  length: number
}

export interface RecomputeResult {
  weave: number[]
  marks: FloatMark[]
}

export interface Alternative {
  threading: number[]
  treadling: number[]
  tieup: number[]
  lift: number[]
  /** 用正算验证重组后的组织图是否与原图逐位相同 */
  verified: boolean
}

export interface ReverseResult {
  feasible: boolean
  mode: Mode
  shaftsNeeded: number
  treadlesNeeded: number
  /** 不可行时给出原因 */
  reason?: string
  /** 规范化（紧凑编号 + 字典序）的解；feasible 时存在 */
  canonical?: Alternative
  /**
   * 标号解数量（BigInt 序列化为字符串）。
   * 数量来源是真实枚举/计数公式，不猜测；超过 cap 时只列出前若干个代表。
   */
  labeledCount?: string
  /** 解数量的中文解释（构成拆解） */
  countExplanation?: string
  /** 最多枚举前 alternativesCap 个标号解供查看，全部经过验证 */
  alternatives: Alternative[]
  alternativesTruncated: boolean
}

export interface WorkerRequest {
  id: number
  type: 'recompute' | 'analyze' | 'floats'
  mode: Mode
  loom: LoomSpec
  threading: number[]
  treadling: number[]
  tieup: number[]
  lift: number[]
  /** analyze：待反推的组织图；floats：待扫描浮线的组织图 */
  weave?: number[]
  floatThreshold?: number
}

export type WorkerResponse =
  | { id: number; type: 'recompute'; ok: true; result: RecomputeResult }
  | { id: number; type: 'recompute'; ok: false; error: string }
  | { id: number; type: 'analyze'; ok: true; result: ReverseResult }
  | { id: number; type: 'analyze'; ok: false; error: string }
  | { id: number; type: 'floats'; ok: true; marks: FloatMark[] }
  | { id: number; type: 'floats'; ok: false; error: string }

export const FORMAT_ID = 'weave-studio-json'
export const FORMAT_VERSION = 1
