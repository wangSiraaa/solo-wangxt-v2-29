/**
 * 工程数据模型。
 *
 * 交织结构（组织点）与颜色严格分开存储：
 *  - 结构：threading / tieUp / treadling 推导出的布尔组织图；
 *  - 颜色：warpColors / weftColors，仅影响织物预览的渲染，不参与任何结构计算。
 */

export interface ProjectData {
  /** 综框页数 */
  shaftCount: number
  /** 踏板数 */
  treadleCount: number
  /** 每根经纱穿入的综框序号，长度 = 经纱数，取值 0..shaftCount-1 */
  threading: number[]
  /** 纹板：tieUp[踏板][综框] = true 表示该踏板提起该综框 */
  tieUp: boolean[][]
  /** 每根纬纱对应的踏板序号，长度 = 纬纱数，取值 0..treadleCount-1 */
  treadling: number[]
  /** 每根经纱的颜色（仅显示用，与结构无关） */
  warpColors: string[]
  /** 每根纬纱的颜色（仅显示用，与结构无关） */
  weftColors: string[]
}

export interface Project extends ProjectData {
  id: string
  name: string
  updatedAt: number
}

export const LIMITS = {
  minEnds: 4,
  maxEnds: 96,
  minPicks: 4,
  maxPicks: 96,
  minShafts: 1,
  maxShafts: 16,
  minTreadles: 1,
  maxTreadles: 16,
} as const
