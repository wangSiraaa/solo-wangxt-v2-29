import { reactive, computed, shallowRef } from 'vue'
import type {
  FloatMark,
  LoomSpec,
  Mode,
  ReverseResult,
  WeaveProject
} from './types'
import { FORMAT_ID, FORMAT_VERSION } from './types'
import { workerClient } from './logic/client'
import { forwardWeave } from './logic/weave'
import { PRESETS } from './presets'
import { db, deleteProject, listProjects, saveProject } from './db'

/** 撤销快照：结构、颜色、尺寸、模式全部记录，批量拖绘后撤销可整体恢复 */
interface Snapshot {
  mode: Mode
  loom: LoomSpec
  threading: number[]
  treadling: number[]
  tieup: number[]
  lift: number[]
  weave: number[]
  handEdited: boolean
  floatThreshold: number
  colors: { warp: string[]; weft: string[]; background: string }
}

interface StoreState {
  project: WeaveProject
  marks: FloatMark[]
  busy: boolean
  analyzing: boolean
  message: string
  messageKind: 'info' | 'error'
  reverse: ReverseResult | null
  savedId: number | null
}

const MAX_HISTORY = 100

function takeSnapshot(p: WeaveProject): Snapshot {
  return {
    mode: p.mode,
    loom: { ...p.loom },
    threading: p.threading.slice(),
    treadling: p.treadling.slice(),
    tieup: p.tieup.slice(),
    lift: p.lift.slice(),
    weave: p.weave.slice(),
    handEdited: p.handEdited,
    floatThreshold: p.floatThreshold,
    colors: {
      warp: p.colors.warp.slice(),
      weft: p.colors.weft.slice(),
      background: p.colors.background
    }
  }
}

function defaultColors(spec: LoomSpec) {
  return {
    warp: new Array(spec.ends).fill('#b4332a'),
    weft: new Array(spec.picks).fill('#2f4b7c'),
    background: '#f4efe6'
  }
}

function blankProject(): WeaveProject {
  const loom: LoomSpec = { shafts: 4, treadles: 4, ends: 8, picks: 8 }
  const now = Date.now()
  return {
    format: FORMAT_ID,
    version: FORMAT_VERSION,
    name: '未命名工程',
    createdAt: now,
    updatedAt: now,
    mode: 'tieup',
    loom,
    threading: new Array(loom.ends).fill(-1),
    treadling: new Array(loom.picks).fill(-1),
    tieup: new Array(loom.shafts * loom.treadles).fill(0),
    lift: new Array(loom.picks * loom.shafts).fill(0),
    weave: new Array(loom.ends * loom.picks).fill(0),
    handEdited: true,
    colors: defaultColors(loom),
    floatThreshold: 4
  }
}

class WeaveStore {
  state = reactive<StoreState>({
    project: blankProject(),
    marks: [],
    busy: false,
    analyzing: false,
    message: '',
    messageKind: 'info',
    reverse: null,
    savedId: null
  })

  private undoStack: Snapshot[] = []
  private redoStack: Snapshot[] = []
  private dragging = false
  private recalcTimer: ReturnType<typeof setTimeout> | null = null
  private recalcToken = 0
  private floatTimer: ReturnType<typeof setTimeout> | null = null
  private floatToken = 0

  canUndo = computed(() => this.undoStack.length > 0)
  canRedo = computed(() => this.redoStack.length > 0)

  /** 与主线程组织图保持一致：false 表示当前组织图是手绘/导入的，方案尚未对齐 */
  consistent = computed(() => !this.state.project.handEdited)

  savedProjects = shallowRef<WeaveProject[]>([])

  constructor() {
    // 首屏载入平纹样例，结构一致、立即可见
    this.loadProject(PRESETS[0].build(), false)
    void this.refreshLibrary()
  }

  // ---------- 撤销 ----------

  private pushUndo() {
    this.undoStack.push(takeSnapshot(this.state.project))
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift()
    this.redoStack.length = 0
  }

  private restore(s: Snapshot) {
    const p = this.state.project
    p.mode = s.mode
    p.loom = { ...s.loom }
    p.threading = s.threading.slice()
    p.treadling = s.treadling.slice()
    p.tieup = s.tieup.slice()
    p.lift = s.lift.slice()
    p.weave = s.weave.slice()
    p.handEdited = s.handEdited
    p.floatThreshold = s.floatThreshold
    p.colors = {
      warp: s.colors.warp.slice(),
      weft: s.colors.weft.slice(),
      background: s.colors.background
    }
  }

  undo() {
    const s = this.undoStack.pop()
    if (!s) return
    this.redoStack.push(takeSnapshot(this.state.project))
    this.restore(s)
    this.afterStructuralChange(true)
    this.flash('已撤销上一批操作（全部受影响数据已恢复）。')
  }

  redo() {
    const s = this.redoStack.pop()
    if (!s) return
    this.undoStack.push(takeSnapshot(this.state.project))
    this.restore(s)
    this.afterStructuralChange(true)
  }

  // ---------- 批量拖绘 ----------

  beginDrag() {
    this.dragging = true
    this.pushUndo()
  }

  endDrag() {
    if (!this.dragging) return
    this.dragging = false
    // 按手势最终改到的数据类型触发对应计算
    if (this.state.project.handEdited) this.scheduleFloats(0)
    else this.scheduleRecalc(0)
  }

  /** 颜色拖选结束：颜色与结构分开存储，无需重算组织图 */
  endColorDrag() {
    this.dragging = false
  }

  // ---------- 结构编辑（穿综 / 纹板 / 吊综 / 多臂）----------

  /** 穿综：把第 x 根经纱穿到 shaft（-1 空穿）。同一列只允许一个综框点。 */
  setThreading(x: number, shaft: number) {
    const p = this.state.project
    if (x < 0 || x >= p.loom.ends) return
    if (p.threading[x] === shaft) return
    if (!this.dragging) this.pushUndo()
    p.threading[x] = shaft
    p.handEdited = false
    this.scheduleRecalc()
  }

  /** 纹板（tie-up）：第 y 纬踩踏板 treadle（单选） */
  setTreadling(y: number, treadle: number) {
    const p = this.state.project
    if (y < 0 || y >= p.loom.picks) return
    if (p.treadling[y] === treadle) return
    if (!this.dragging) this.pushUndo()
    p.treadling[y] = treadle
    p.handEdited = false
    this.scheduleRecalc()
  }

  /** 吊综关系：shaft/treadle 交叉点取 0/1（可拖刷） */
  paintTieup(shaft: number, treadle: number, value: number) {
    const p = this.state.project
    if (shaft < 0 || shaft >= p.loom.shafts || treadle < 0 || treadle >= p.loom.treadles) return
    const i = shaft * p.loom.treadles + treadle
    if (p.tieup[i] === value) return
    if (!this.dragging) this.pushUndo()
    p.tieup[i] = value
    p.handEdited = false
    this.scheduleRecalc()
  }

  /** 多臂纹板：第 y 纬、第 shaft 综框是否提起（可拖刷） */
  paintLift(y: number, shaft: number, value: number) {
    const p = this.state.project
    if (y < 0 || y >= p.loom.picks || shaft < 0 || shaft >= p.loom.shafts) return
    const i = y * p.loom.shafts + shaft
    if (p.lift[i] === value) return
    if (!this.dragging) this.pushUndo()
    p.lift[i] = value
    p.handEdited = false
    this.scheduleRecalc()
  }

  /**
   * 手绘组织图：只改结构点阵，不触碰颜色。
   * 手绘后进入 handEdited：方案区不再“自动声称”与组织图一致，
   * 需通过反推把穿综/纹板对齐回去。
   */
  paintWeave(x: number, y: number, value: number) {
    const p = this.state.project
    if (x < 0 || x >= p.loom.ends || y < 0 || y >= p.loom.picks) return
    const i = y * p.loom.ends + x
    if (p.weave[i] === value) return
    if (!this.dragging) this.pushUndo()
    p.weave[i] = value
    p.handEdited = true
    this.state.reverse = null
    this.scheduleFloats()
  }

  // ---------- 颜色（与结构分开存储，不触发任何重算）----------

  setWarpColor(x: number, color: string) {
    const p = this.state.project
    if (x < 0 || x >= p.loom.ends) return
    if (!this.dragging) this.pushUndo()
    p.colors.warp[x] = color
  }

  setWeftColor(y: number, color: string) {
    const p = this.state.project
    if (y < 0 || y >= p.loom.picks) return
    if (!this.dragging) this.pushUndo()
    p.colors.weft[y] = color
  }

  // ---------- 尺寸 / 模式 ----------

  resize(patch: Partial<LoomSpec>) {
    const p = this.state.project
    this.pushUndo()
    const old = { ...p.loom }
    const next = { ...old, ...patch }
    next.shafts = clampInt(next.shafts, 1, 32)
    next.treadles = clampInt(next.treadles, 1, 32)
    next.ends = clampInt(next.ends, 1, 400)
    next.picks = clampInt(next.picks, 1, 400)

    p.threading = resize1D(p.threading, next.ends, -1)
    p.treadling = resize1D(p.treadling, next.picks, -1)
    p.colors.warp = resize1D(p.colors.warp, next.ends, '#b4332a')
    p.colors.weft = resize1D(p.colors.weft, next.picks, '#2f4b7c')
    // 超出新综框/踏板编号的旧值复位
    for (let x = 0; x < next.ends; x++) {
      if (p.threading[x] >= next.shafts) p.threading[x] = -1
    }
    for (let y = 0; y < next.picks; y++) {
      if (p.treadling[y] >= next.treadles) p.treadling[y] = -1
    }
    p.tieup = resize2D(p.tieup, old.shafts, old.treadles, next.shafts, next.treadles, 0)
    p.lift = resize2D(p.lift, old.picks, old.shafts, next.picks, next.shafts, 0)
    p.weave = resize2D(p.weave, old.picks, old.ends, next.picks, next.ends, 0)
    p.loom = next
    p.handEdited = true
    this.state.reverse = null
    this.afterStructuralChange(true)
  }

  async switchMode(mode: Mode) {
    const p = this.state.project
    if (mode === p.mode) return
    this.pushUndo()
    if (mode === 'dobby') {
      // 用 tie-up + 纹板正推出每一纬的提综向量，保证切换瞬间织纹不变
      p.lift = this.deriveLift()
    } else {
      // 多臂 → tie-up：尝试反推；踏板不够时明确告知，不强行凑
      try {
        this.state.busy = true
        const r = await workerClient.analyze({
          mode: 'tieup',
          loom: p.loom,
          threading: p.threading.slice(),
          treadling: p.treadling.slice(),
          tieup: p.tieup.slice(),
          lift: p.lift.slice(),
          weave: p.weave.slice()
        })
        if (r.feasible && r.canonical) {
          p.threading = r.canonical.threading.slice()
          p.treadling = r.canonical.treadling.slice()
          p.tieup = r.canonical.tieup.slice()
        } else {
          this.flash(
            r.reason ?? '当前多臂织纹无法用现有踏板数表达为 tie-up 方案，已保留旧吊综/纹板。',
            'error'
          )
        }
      } finally {
        this.state.busy = false
      }
    }
    p.mode = mode
    p.handEdited = false
    this.scheduleRecalc(0)
  }

  private deriveLift(): number[] {
    const p = this.state.project
    const { picks, shafts, treadles } = p.loom
    const lift = new Array<number>(picks * shafts).fill(0)
    for (let y = 0; y < picks; y++) {
      const t = p.treadling[y]
      for (let s = 0; s < shafts; s++) {
        if (t >= 0 && t < treadles && p.tieup[s * treadles + t]) lift[y * shafts + s] = 1
      }
    }
    return lift
  }

  setThreshold(v: number) {
    this.pushUndo()
    this.state.project.floatThreshold = clampInt(v, 2, 400)
    this.afterStructuralChange(true)
  }

  setName(name: string) {
    this.state.project.name = name
  }

  // ---------- Worker 调度（防抖 + 过期令牌丢弃）----------

  private scheduleRecalc(delay = 30) {
    // 拖刷过程中不重算：整笔手势在 endDrag() 时一次性重算，保证“批量操作”语义
    if (this.dragging) return
    if (this.recalcTimer) clearTimeout(this.recalcTimer)
    this.recalcTimer = setTimeout(() => void this.runRecalc(), delay)
  }

  private scheduleFloats(delay = 30) {
    if (this.dragging) return
    if (this.floatTimer) clearTimeout(this.floatTimer)
    this.floatTimer = setTimeout(() => void this.runFloats(), delay)
  }

  private afterStructuralChange(immediate: boolean) {
    const p = this.state.project
    this.state.reverse = null
    if (p.handEdited) {
      this.scheduleFloats(immediate ? 0 : 30)
    } else {
      this.scheduleRecalc(immediate ? 0 : 30)
    }
  }

  private async runRecalc() {
    const token = ++this.recalcToken
    const p = this.state.project
    this.state.busy = true
    try {
      const r = await workerClient.recompute({
        mode: p.mode,
        loom: { ...p.loom },
        threading: p.threading.slice(),
        treadling: p.treadling.slice(),
        tieup: p.tieup.slice(),
        lift: p.lift.slice(),
        floatThreshold: p.floatThreshold
      })
      if (token !== this.recalcToken) return // 已有更新的编辑
      p.weave = r.weave
      this.state.marks = r.marks
    } catch (e) {
      this.flash((e as Error).message, 'error')
    } finally {
      if (token === this.recalcToken) this.state.busy = false
    }
  }

  private async runFloats() {
    const token = ++this.floatToken
    const p = this.state.project
    try {
      const marks = await workerClient.floats({
        loom: { ...p.loom },
        weave: p.weave.slice(),
        threshold: p.floatThreshold
      })
      if (token !== this.floatToken) return
      this.state.marks = marks
    } catch (e) {
      this.flash((e as Error).message, 'error')
    }
  }

  // ---------- 反推 ----------

  async analyze() {
    const p = this.state.project
    this.state.analyzing = true
    this.state.busy = true
    try {
      const r = await workerClient.analyze({
        mode: p.mode,
        loom: { ...p.loom },
        threading: p.threading.slice(),
        treadling: p.treadling.slice(),
        tieup: p.tieup.slice(),
        lift: p.lift.slice(),
        weave: p.weave.slice()
      })
      this.state.reverse = r
      if (!r.feasible) {
        this.flash(`反推无解：${r.reason ?? ''}`, 'error')
      }
    } catch (e) {
      this.flash((e as Error).message, 'error')
    } finally {
      this.state.analyzing = false
      this.state.busy = false
    }
  }

  /** 采用反推给出的某个方案（规范解或枚举解之一）。整批一次撤销。 */
  applyAlternative(index: number | 'canonical') {
    const r = this.state.reverse
    if (!r || !r.feasible || !r.canonical) return
    const alt = index === 'canonical' ? r.canonical : r.alternatives[index]
    if (!alt || !alt.verified) {
      this.flash('该方案未通过正算验证，拒绝采用。', 'error')
      return
    }
    const p = this.state.project
    this.pushUndo()
    p.threading = alt.threading.slice()
    if (p.mode === 'tieup') {
      p.treadling = alt.treadling.slice()
      p.tieup = alt.tieup.slice()
    } else {
      p.lift = alt.lift.slice()
    }
    p.handEdited = false
    this.scheduleRecalc(0)
    this.flash(
      index === 'canonical'
        ? '已采用规范解（穿综/纹板已按组织图重算并校验）。'
        : `已采用第 ${index + 1} 个标号解（已通过正算逐位校验）。`
    )
  }

  // ---------- 工程 / 预设 / 库 ----------

  loadProject(project: WeaveProject, notify = true) {
    this.state.project = project
    this.undoStack.length = 0
    this.redoStack.length = 0
    this.state.reverse = null
    this.state.savedId = project.id ?? null
    this.state.marks = []
    this.afterStructuralChange(true)
    if (notify) this.flash(`已载入工程「${project.name}」。`)
  }

  loadPreset(key: string) {
    const preset = PRESETS.find((x) => x.key === key)
    if (!preset) return
    this.loadProject(preset.build())
    this.flash(preset.hint)
  }

  newProject() {
    this.loadProject(blankProject())
  }

  async persist() {
    try {
      const p = this.state.project
      const id = await saveProject(p)
      p.id = id
      this.state.savedId = id
      await this.refreshLibrary()
      this.flash(`已保存到本地工程库（id=${id}）。`)
    } catch (e) {
      this.flash(`保存失败：${(e as Error).message}`, 'error')
    }
  }

  async open(id: number) {
    const found = await db.projects.get(id)
    if (!found) {
      this.flash('本地库中找不到该工程。', 'error')
      return
    }
    this.loadProject(found)
  }

  async remove(id: number) {
    await deleteProject(id)
    if (this.state.savedId === id) this.state.savedId = null
    await this.refreshLibrary()
  }

  async refreshLibrary() {
    this.savedProjects.value = await listProjects()
  }

  // ---------- 工具 ----------

  flash(message: string, kind: 'info' | 'error' = 'info') {
    this.state.message = message
    this.state.messageKind = kind
  }

  /** 供导出使用：当前正算织纹（不写回状态） */
  previewForward(): number[] {
    const p = this.state.project
    return forwardWeave(p.mode, p.loom, p.threading, p.treadling, p.tieup, p.lift)
  }
}

function clampInt(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo
  return Math.max(lo, Math.min(hi, Math.round(v)))
}

function resize1D(src: number[] | string[], n: number, fill: number | string) {
  const out = new Array(n).fill(fill)
  for (let i = 0; i < Math.min(n, src.length); i++) out[i] = src[i]
  return out
}

/** 行主序二维数组扩缩容 */
function resize2D(src: number[], oldRows: number, oldCols: number, rows: number, cols: number, fill: number) {
  const out = new Array<number>(rows * cols).fill(fill)
  for (let y = 0; y < Math.min(rows, oldRows); y++) {
    for (let x = 0; x < Math.min(cols, oldCols); x++) {
      out[y * cols + x] = src[y * oldCols + x]
    }
  }
  return out
}

export const store = new WeaveStore()
