import Dexie, { type Table } from 'dexie'
import type { WeaveProject } from './types'
import { FORMAT_ID, FORMAT_VERSION } from './types'

/**
 * 本地工程库（IndexedDB via Dexie）。无后台接口：
 * 工程只存在浏览器本地，可另存为 JSON 导回。
 */
class WeaveDB extends Dexie {
  projects!: Table<WeaveProject, number>

  constructor() {
    super('weave-studio')
    this.version(1).stores({
      // 只索引关键字段，文档整体存取
      projects: '++id, name, updatedAt, mode'
    })
  }
}

export const db = new WeaveDB()

export async function listProjects(): Promise<WeaveProject[]> {
  return db.projects.orderBy('updatedAt').reverse().toArray()
}

export async function saveProject(p: WeaveProject): Promise<number> {
  p.updatedAt = Date.now()
  p.format = FORMAT_ID
  p.version = FORMAT_VERSION
  if (p.id !== undefined) {
    await db.projects.put(p)
    return p.id
  }
  delete (p as Partial<WeaveProject>).id
  return db.projects.add(p)
}

export async function deleteProject(id: number): Promise<void> {
  await db.projects.delete(id)
}

/** 严格校验导入的 JSON；不合法时抛出带中文说明的错误 */
export function validateImport(raw: unknown): WeaveProject {
  if (typeof raw !== 'object' || raw === null) throw new Error('文件内容不是 JSON 对象')
  const o = raw as Record<string, unknown>
  if (o.format !== FORMAT_ID) {
    throw new Error(`格式标识不匹配：期望 "${FORMAT_ID}"，文件为 "${String(o.format)}"。`)
  }
  if (o.version !== FORMAT_VERSION) {
    throw new Error(`格式版本不受支持：文件版本 ${String(o.version)}，本工具支持版本 ${FORMAT_VERSION}。`)
  }
  const loom = o.loom as Record<string, unknown> | undefined
  if (!loom) throw new Error('缺少 loom 参数。')
  for (const k of ['shafts', 'treadles', 'ends', 'picks'] as const) {
    const v = loom[k]
    if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) {
      throw new Error(`loom.${k} 必须为正整数。`)
    }
  }
  const L = loom as unknown as WeaveProject['loom']
  if (L.shafts > 32 || L.treadles > 32 || L.ends > 400 || L.picks > 400) {
    throw new Error('尺寸超出允许范围（综框/踏板 ≤ 32，经/纬 ≤ 400）。')
  }
  const expectLen = (v: unknown, n: number, name: string) => {
    if (!Array.isArray(v) || v.length !== n) {
      throw new Error(`${name} 长度应为 ${n}。`)
    }
    if (!v.every((x) => typeof x === 'number' && Number.isInteger(x))) {
      throw new Error(`${name} 必须为整数数组。`)
    }
  }
  const expectStringArray = (v: unknown, n: number, name: string) => {
    if (!Array.isArray(v) || v.length !== n) {
      throw new Error(`${name} 长度应为 ${n}。`)
    }
    if (!v.every((x) => typeof x === 'string')) {
      throw new Error(`${name} 必须为颜色字符串数组。`)
    }
  }
  expectLen(o.threading, L.ends, 'threading（穿综）')
  expectLen(o.treadling, L.picks, 'treadling（纹板）')
  expectLen(o.tieup, L.shafts * L.treadles, 'tieup（吊综）')
  expectLen(o.lift, L.picks * L.shafts, 'lift（多臂）')
  expectLen(o.weave, L.ends * L.picks, 'weave（组织图）')

  const threading = o.threading as number[]
  const treadling = o.treadling as number[]
  const tieup = o.tieup as number[]
  const lift = o.lift as number[]
  const weave = o.weave as number[]
  if (threading.some((v) => v < -1 || v >= L.shafts)) throw new Error('threading 含非法综框编号。')
  if (treadling.some((v) => v < -1 || v >= L.treadles)) throw new Error('treadling 含非法踏板编号。')
  if (tieup.some((v) => v !== 0 && v !== 1)) throw new Error('tieup 必须只含 0/1。')
  if (lift.some((v) => v !== 0 && v !== 1)) throw new Error('lift 必须只含 0/1。')
  if (weave.some((v) => v !== 0 && v !== 1)) throw new Error('weave 必须只含 0/1。')

  const colors = o.colors as WeaveProject['colors'] | undefined
  if (!colors || !Array.isArray(colors.warp) || !Array.isArray(colors.weft)) {
    throw new Error('缺少 colors.warp / colors.weft 颜色数组。')
  }
  expectStringArray(colors.warp, L.ends, 'colors.warp')
  expectStringArray(colors.weft, L.picks, 'colors.weft')

  const mode = o.mode === 'dobby' ? 'dobby' : 'tieup'
  return {
    ...(o as unknown as WeaveProject),
    mode,
    id: undefined // 导入作为新工程，避免覆盖库中同名记录
  }
}
