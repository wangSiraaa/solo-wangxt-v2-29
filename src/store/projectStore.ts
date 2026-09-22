import { computed, reactive, ref } from 'vue'
import {
  computePattern,
  findFloats,
  type Draft,
  type Pattern,
  type SolveResult,
} from '../core/weave'
import { LIMITS, type Project, type ProjectData } from '../core/types'
import { plainWeaveDraft, satinPattern, twillDraft } from '../core/presets'
import { db } from '../db/db'

const DEFAULT_WARP_COLOR = '#274690'
const DEFAULT_WEFT_COLOR = '#f5ead6'
const HISTORY_LIMIT = 100

export interface NoticeAction {
  label: string
  run: () => void
}

export interface Notice {
  kind: 'info' | 'warn' | 'error'
  text: string
  details: string[]
  action?: NoticeAction
}

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(v) || min))
}

function makeProject(data: ProjectData, name: string): Project {
  return { id: uid(), name, updatedAt: Date.now(), ...data }
}

function defaultProject(): Project {
  const ends = 24
  const picks = 24
  const d = plainWeaveDraft(ends, picks)
  return makeProject(
    {
      ...d,
      warpColors: Array(ends).fill(DEFAULT_WARP_COLOR),
      weftColors: Array(picks).fill(DEFAULT_WEFT_COLOR),
    },
    '未命名工程',
  )
}

// ---------------------------------------------------------------------------
// 响应式状态
// ---------------------------------------------------------------------------

export const project = reactive<Project>(defaultProject())

/** 由方案推导的组织图（唯一事实来源之一） */
export const pattern = computed<Pattern>(() => computePattern(project))

/** 用户直接画在组织图上、尚未成功反推的编辑；非 null 时界面处于“未同步”状态 */
export const editedPattern = ref<Pattern | null>(null)

/** 实际展示的组织图 */
export const displayPattern = computed<Pattern>(() => editedPattern.value ?? pattern.value)

export const patternDirty = computed(() => editedPattern.value !== null)

export const floatThreshold = ref(5)
export const floats = computed(() => findFloats(displayPattern.value, floatThreshold.value))

export const selectedColor = ref('#274690')
export const palette = [
  '#274690',
  '#8c1c13',
  '#2f6f4f',
  '#b07d2b',
  '#5b3a8e',
  '#222222',
  '#8a8a8a',
  '#f5ead6',
]

export const notice = ref<Notice | null>(null)
export const solving = ref(false)

// ---------------------------------------------------------------------------
// 撤销 / 重做：以“一次事务”为单位，批量操作只产生一条记录，
// 撤销时整体恢复事务前的全部受影响数据。
// ---------------------------------------------------------------------------

interface HistoryEntry {
  label: string
  before: string
  after: string
}

const undoStack = ref<HistoryEntry[]>([])
const redoStack = ref<HistoryEntry[]>([])
export const canUndo = computed(() => undoStack.value.length > 0)
export const canRedo = computed(() => redoStack.value.length > 0)
export const undoLabel = computed(() => undoStack.value[undoStack.value.length - 1]?.label ?? '')
export const redoLabel = computed(() => redoStack.value[redoStack.value.length - 1]?.label ?? '')

function snapshot(): string {
  return JSON.stringify(project)
}

function restore(snap: string): void {
  Object.assign(project, JSON.parse(snap))
  editedPattern.value = null
  invalidateSolver()
}

/** 所有对工程数据的修改都经过这里，自动记录历史并调度保存 */
export function mutateProject(label: string, fn: () => void): void {
  const before = snapshot()
  fn()
  const after = snapshot()
  if (before === after) return
  editedPattern.value = null
  invalidateSolver() // 结构已变，尚未返回的反推结果一律作废
  undoStack.value.push({ label, before, after })
  if (undoStack.value.length > HISTORY_LIMIT) undoStack.value.shift()
  redoStack.value = []
  scheduleSave()
}

export function undo(): void {
  const e = undoStack.value.pop()
  if (!e) return
  redoStack.value.push(e)
  restore(e.before)
  scheduleSave()
}

export function redo(): void {
  const e = redoStack.value.pop()
  if (!e) return
  undoStack.value.push(e)
  restore(e.after)
  scheduleSave()
}

// ---------------------------------------------------------------------------
// 编辑操作（每个函数 = 一条撤销记录）
// ---------------------------------------------------------------------------

export function applyThreadingEdits(edits: { x: number; shaft: number }[]): void {
  if (edits.length === 0) return
  mutateProject(`穿综（${edits.length} 根经纱）`, () => {
    const next = project.threading.slice()
    for (const e of edits) {
      if (e.x >= 0 && e.x < next.length && e.shaft >= 0 && e.shaft < project.shaftCount) {
        next[e.x] = e.shaft
      }
    }
    project.threading = next
  })
}

export function applyTieUpEdits(edits: { treadle: number; shaft: number; value: boolean }[]): void {
  if (edits.length === 0) return
  mutateProject(`纹板（${edits.length} 格）`, () => {
    const next = project.tieUp.map((r) => r.slice())
    for (const e of edits) {
      if (next[e.treadle] && e.shaft >= 0 && e.shaft < project.shaftCount) {
        next[e.treadle][e.shaft] = e.value
      }
    }
    project.tieUp = next
  })
}

export function applyTreadlingEdits(edits: { y: number; treadle: number }[]): void {
  if (edits.length === 0) return
  mutateProject(`踏板顺序（${edits.length} 根纬纱）`, () => {
    const next = project.treadling.slice()
    for (const e of edits) {
      if (e.y >= 0 && e.y < next.length && e.treadle >= 0 && e.treadle < project.treadleCount) {
        next[e.y] = e.treadle
      }
    }
    project.treadling = next
  })
}

export function applyWarpColors(edits: { x: number; color: string }[]): void {
  if (edits.length === 0) return
  mutateProject(`经纱颜色（${edits.length} 根）`, () => {
    const next = project.warpColors.slice()
    for (const e of edits) if (e.x >= 0 && e.x < next.length) next[e.x] = e.color
    project.warpColors = next
  })
}

export function applyWeftColors(edits: { y: number; color: string }[]): void {
  if (edits.length === 0) return
  mutateProject(`纬纱颜色（${edits.length} 根）`, () => {
    const next = project.weftColors.slice()
    for (const e of edits) if (e.y >= 0 && e.y < next.length) next[e.y] = e.color
    project.weftColors = next
  })
}

export function resizeProject(opts: {
  warpEnds?: number
  weftPicks?: number
  shafts?: number
  treadles?: number
}): void {
  mutateProject('调整规格', () => {
    if (opts.shafts !== undefined) {
      const shafts = clamp(opts.shafts, LIMITS.minShafts, LIMITS.maxShafts)
      if (shafts !== project.shaftCount) {
        project.shaftCount = shafts
        project.threading = project.threading.map((s) => Math.min(s, shafts - 1))
        project.tieUp = project.tieUp.map((row) => {
          const next = row.slice(0, shafts)
          while (next.length < shafts) next.push(false)
          return next
        })
      }
    }
    if (opts.treadles !== undefined) {
      const treadles = clamp(opts.treadles, LIMITS.minTreadles, LIMITS.maxTreadles)
      if (treadles !== project.treadleCount) {
        project.treadleCount = treadles
        project.treadling = project.treadling.map((t) => Math.min(t, treadles - 1))
        const next = project.tieUp.slice(0, treadles).map((r) => r.slice())
        while (next.length < treadles) next.push(Array(project.shaftCount).fill(false))
        project.tieUp = next
      }
    }
    if (opts.warpEnds !== undefined) {
      const ends = clamp(opts.warpEnds, LIMITS.minEnds, LIMITS.maxEnds)
      if (ends !== project.threading.length) {
        const threading = project.threading.slice(0, ends)
        const warpColors = project.warpColors.slice(0, ends)
        for (let i = threading.length; i < ends; i++) {
          threading.push(i % project.shaftCount)
          warpColors.push(DEFAULT_WARP_COLOR)
        }
        project.threading = threading
        project.warpColors = warpColors
      }
    }
    if (opts.weftPicks !== undefined) {
      const picks = clamp(opts.weftPicks, LIMITS.minPicks, LIMITS.maxPicks)
      if (picks !== project.treadling.length) {
        const treadling = project.treadling.slice(0, picks)
        const weftColors = project.weftColors.slice(0, picks)
        for (let i = treadling.length; i < picks; i++) {
          treadling.push(i % project.treadleCount)
          weftColors.push(DEFAULT_WEFT_COLOR)
        }
        project.treadling = treadling
        project.weftColors = weftColors
      }
    }
  })
}

// ---------------------------------------------------------------------------
// 组织图直接编辑 → Web Worker 反推
// ---------------------------------------------------------------------------

interface WorkerResultMessage {
  seq: number
  result: SolveResult
}

const worker = new Worker(new URL('../workers/solver.worker.ts', import.meta.url), {
  type: 'module',
})

let solveSeq = 0
let solveTimer: ReturnType<typeof setTimeout> | undefined

/** 使尚未返回的求解结果失效（结构被其它编辑改变、或用户放弃修改时调用） */
function invalidateSolver(): void {
  solveSeq++
  solving.value = false
}

worker.onmessage = (e: MessageEvent<WorkerResultMessage>) => {
  if (e.data.seq !== solveSeq) return // 过期结果
  solving.value = false
  const res = e.data.result
  if (res.status === 'none') {
    // 绝不套用看似正确的数字：保留草稿不动，组织图保持“未同步”并说明原因
    notice.value = {
      kind: 'error',
      text: `无法反推：${res.message}`,
      details: res.details,
      action: failureAction(res),
    }
    return
  }
  const draft = res.draft!
  mutateProject('组织图反推方案', () => applyDraft(draft))
  editedPattern.value = null
  notice.value =
    res.status === 'multiple'
      ? { kind: 'warn', text: res.message, details: res.details }
      : { kind: 'info', text: res.message, details: res.details }
}

worker.onerror = () => {
  solving.value = false
  notice.value = { kind: 'error', text: '反推计算线程出错，请重试。', details: [] }
}

function failureAction(res: SolveResult): NoticeAction | undefined {
  if (res.neededShafts !== undefined && res.neededShafts > project.shaftCount) {
    const n = res.neededShafts
    return {
      label: `调整为 ${n} 页综并重试`,
      run: () => {
        const pending = editedPattern.value
        resizeProject({ shafts: n })
        editedPattern.value = pending // resize 会清空未同步编辑，这里恢复后再试
        requestSolve()
      },
    }
  }
  if (res.neededTreadles !== undefined && res.neededTreadles > project.treadleCount) {
    const n = res.neededTreadles
    return {
      label: `调整为 ${n} 只踏板并重试`,
      run: () => {
        const pending = editedPattern.value
        resizeProject({ treadles: n })
        editedPattern.value = pending
        requestSolve()
      },
    }
  }
  return undefined
}

function syncLen(arr: string[], len: number, fill: string): string[] {
  const next = arr.slice(0, len)
  while (next.length < len) next.push(fill)
  return next
}

function applyDraft(d: Draft): void {
  project.threading = d.threading.slice()
  project.treadling = d.treadling.slice()
  // 颜色与结构分开存储，但每根纱一条目，长度需保持同步
  project.warpColors = syncLen(project.warpColors, d.threading.length, DEFAULT_WARP_COLOR)
  project.weftColors = syncLen(project.weftColors, d.treadling.length, DEFAULT_WEFT_COLOR)
  const tie: boolean[][] = []
  for (let t = 0; t < project.treadleCount; t++) {
    const row: boolean[] = []
    for (let s = 0; s < project.shaftCount; s++) row.push(!!(d.tieUp[t] && d.tieUp[t][s]))
    tie.push(row)
  }
  project.tieUp = tie
}

function requestSolve(): void {
  const p = editedPattern.value
  if (!p) return
  clearTimeout(solveTimer)
  solveTimer = setTimeout(() => {
    solving.value = true
    solveSeq++
    worker.postMessage({
      seq: solveSeq,
      pattern: p,
      shaftCount: project.shaftCount,
      treadleCount: project.treadleCount,
    })
  }, 250)
}

/** 组织图绘制：先落到 editedPattern（未同步），再由 Worker 反推 */
export function applyPatternEdits(edits: { x: number; y: number; value: boolean }[]): void {
  if (edits.length === 0) return
  const base = (editedPattern.value ?? pattern.value).map((r) => r.slice())
  for (const e of edits) {
    if (base[e.y] && e.x >= 0 && e.x < base[e.y].length) base[e.y][e.x] = e.value
  }
  editedPattern.value = base
  requestSolve()
}

/** 放弃未同步的组织图修改，回到由方案推导的组织 */
export function discardPatternEdits(): void {
  editedPattern.value = null
  invalidateSolver()
  notice.value = null
}

export function dismissNotice(): void {
  notice.value = null
}

// ---------------------------------------------------------------------------
// 预设
// ---------------------------------------------------------------------------

export function loadPreset(kind: 'plain' | 'twill' | 'satin8'): void {
  if (kind === 'satin8') {
    // 超过当前综框能力的例子：把八枚缎纹画到组织图上，走正常反推流程，
    // 综框不足时会如实报告无解，并给出“增加综框重试”的入口。
    mutateProject('载入八枚缎纹组织', () => {
      setExactSize(16, 16)
    })
    editedPattern.value = satinPattern(8, 3, 16, 16)
    notice.value = {
      kind: 'info',
      text: '已把八枚缎纹（需 8 页综）画入组织图，正在按当前综框数尝试反推……',
      details: [],
    }
    requestSolve()
    return
  }
  const ends = project.threading.length
  const picks = project.treadling.length
  const d = kind === 'plain' ? plainWeaveDraft(ends, picks) : twillDraft(ends, picks)
  mutateProject(kind === 'plain' ? '载入平纹预设' : '载入 2/2 斜纹预设', () => {
    project.shaftCount = d.shaftCount
    project.treadleCount = d.treadleCount
    applyDraft(d)
  })
  notice.value = null
}

function setExactSize(ends: number, picks: number): void {
  // 仅在 mutate 内部使用：把经纬向尺寸精确调整到指定值
  project.threading = syncLenNum(project.threading, ends, (i) => i % project.shaftCount)
  project.warpColors = syncLen(project.warpColors, ends, DEFAULT_WARP_COLOR)
  project.treadling = syncLenNum(project.treadling, picks, (i) => i % project.treadleCount)
  project.weftColors = syncLen(project.weftColors, picks, DEFAULT_WEFT_COLOR)
}

function syncLenNum(arr: number[], len: number, fill: (i: number) => number): number[] {
  const next = arr.slice(0, len)
  for (let i = next.length; i < len; i++) next.push(fill(i))
  return next
}

// ---------------------------------------------------------------------------
// 持久化（Dexie / IndexedDB）
// ---------------------------------------------------------------------------

export const projectList = ref<Project[]>([])
export const saveState = ref<'saved' | 'saving'>('saved')

let saveTimer: ReturnType<typeof setTimeout> | undefined

function scheduleSave(): void {
  project.updatedAt = Date.now()
  saveState.value = 'saving'
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void saveNow(), 400)
}

export async function saveNow(): Promise<void> {
  clearTimeout(saveTimer)
  await db.projects.put(JSON.parse(JSON.stringify(project)) as Project)
  saveState.value = 'saved'
  await refreshList()
}

export async function refreshList(): Promise<void> {
  projectList.value = await db.projects.orderBy('updatedAt').reverse().toArray()
}

function replaceProject(p: Project): void {
  Object.assign(project, p)
  editedPattern.value = null
  invalidateSolver()
  undoStack.value = []
  redoStack.value = []
  notice.value = null
}

export async function newProject(): Promise<void> {
  await saveNow()
  replaceProject(defaultProject())
  await saveNow()
}

export async function openProject(id: string): Promise<void> {
  if (id === project.id) return
  const found = await db.projects.get(id)
  if (!found) return
  await saveNow()
  replaceProject(found)
}

export async function deleteProject(id: string): Promise<void> {
  await db.projects.delete(id)
  if (id === project.id) replaceProject(defaultProject())
  await refreshList()
}

export function renameProject(name: string): void {
  mutateProject('重命名工程', () => {
    project.name = name
  })
}

// ---------------------------------------------------------------------------
// JSON 导入 / 导出
// ---------------------------------------------------------------------------

export function exportProjectJson(): string {
  const data = JSON.parse(JSON.stringify(project)) as Project
  return JSON.stringify({ format: 'weave-studio-project', version: 1, project: data }, null, 2)
}

export function validateProjectJson(text: string): Project {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('文件不是合法的 JSON。')
  }
  const wrapper = raw as { format?: unknown; project?: unknown }
  const p = (wrapper && wrapper.project ? wrapper.project : wrapper) as Partial<Project>
  const fail = (msg: string): never => {
    throw new Error(`工程文件校验失败：${msg}`)
  }
  if (typeof p !== 'object' || p === null) fail('缺少工程数据。')
  if (!Number.isInteger(p.shaftCount) || !Number.isInteger(p.treadleCount)) fail('缺少综框/踏板数。')
  if (!Array.isArray(p.threading) || !Array.isArray(p.treadling) || !Array.isArray(p.tieUp)) {
    fail('缺少穿综/踏板/纹板数据。')
  }
  const shafts = p.shaftCount as number
  const treadles = p.treadleCount as number
  const threading = p.threading as unknown[]
  const treadling = p.treadling as unknown[]
  const tieUp = p.tieUp as unknown[]
  if (tieUp.length !== treadles) fail('纹板行数与踏板数不一致。')
  for (const row of tieUp) {
    if (!Array.isArray(row) || row.length !== shafts) fail('纹板列数与综框数不一致。')
  }
  if (threading.some((s) => !Number.isInteger(s) || (s as number) < 0 || (s as number) >= shafts)) {
    fail('穿综序号超出综框范围。')
  }
  if (treadling.some((t) => !Number.isInteger(t) || (t as number) < 0 || (t as number) >= treadles)) {
    fail('踏板序号超出范围。')
  }
  const ends = threading.length
  const picks = treadling.length
  const warpColors =
    Array.isArray(p.warpColors) && p.warpColors.length === ends
      ? (p.warpColors as string[])
      : Array(ends).fill(DEFAULT_WARP_COLOR)
  const weftColors =
    Array.isArray(p.weftColors) && p.weftColors.length === picks
      ? (p.weftColors as string[])
      : Array(picks).fill(DEFAULT_WEFT_COLOR)
  return {
    id: typeof p.id === 'string' ? p.id : uid(),
    name: typeof p.name === 'string' ? p.name : '导入的工程',
    updatedAt: Date.now(),
    shaftCount: shafts,
    treadleCount: treadles,
    threading: threading as number[],
    tieUp: tieUp as boolean[][],
    treadling: treadling as number[],
    warpColors,
    weftColors,
  }
}

/** 导入 JSON：作为新工程载入（保留原文件 id 冲突时重新分配） */
export async function importProjectJson(text: string): Promise<void> {
  const parsed = validateProjectJson(text)
  const existing = await db.projects.get(parsed.id)
  if (existing || parsed.id === project.id) parsed.id = uid()
  await saveNow()
  replaceProject(parsed)
  await saveNow()
  notice.value = { kind: 'info', text: `已导入工程「${parsed.name}」。`, details: [] }
}

// ---------------------------------------------------------------------------
// 初始化
// ---------------------------------------------------------------------------

let initialized = false

export async function init(): Promise<void> {
  if (initialized) return
  initialized = true
  await refreshList()
  const latest = projectList.value[0]
  if (latest) {
    replaceProject(latest)
  } else {
    await saveNow()
  }
}
