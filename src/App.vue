<template>
  <div class="app">
    <header class="app-header">
      <h1>织造工作室 · 经纬组织设计台</h1>
      <span class="subtitle">
        组织点阵 ⇄ 穿综 / 纹板 一致性约束在 Web Worker 中计算 · 工程仅存本地（Dexie）
      </span>
      <span v-if="store.state.busy" class="spinner" title="约束计算中…"></span>
    </header>

    <div class="layout">
      <!-- ============ 左栏：控制 ============ -->
      <aside>
        <section class="panel">
          <h2>工程</h2>
          <div class="field">
            <label>名称</label>
            <input type="text" :value="p.name" @input="store.setName(($event.target as HTMLInputElement).value)" />
          </div>
          <div class="btn-row">
            <button class="primary" @click="store.persist()">存入本地库</button>
            <button @click="store.newProject()">空白</button>
          </div>
          <div class="btn-row">
            <button :disabled="!store.canUndo.value" @click="store.undo()">撤销批量操作</button>
            <button :disabled="!store.canRedo.value" @click="store.redo()">重做</button>
          </div>
          <div v-if="store.state.savedId !== null" class="small">
            本地库记录 id：{{ store.state.savedId }}
          </div>
        </section>

        <section class="panel">
          <h2>织机</h2>
          <div class="field">
            <label>模式</label>
            <select
              :value="p.mode"
              @change="store.switchMode((($event.target as HTMLSelectElement).value) as Mode)"
            >
              <option value="tieup">吊综 tie-up（穿综+纹板+吊综）</option>
              <option value="dobby">多臂 dobby（穿综+逐纬提综）</option>
            </select>
          </div>
          <div class="field">
            <label>综框数</label>
            <input type="number" min="1" max="32" :value="p.loom.shafts" @change="onResize('shafts', $event)" />
          </div>
          <div v-if="p.mode === 'tieup'" class="field">
            <label>踏板数</label>
            <input type="number" min="1" max="32" :value="p.loom.treadles" @change="onResize('treadles', $event)" />
          </div>
          <div class="field">
            <label>经纱数（列）</label>
            <input type="number" min="1" max="400" :value="p.loom.ends" @change="onResize('ends', $event)" />
          </div>
          <div class="field">
            <label>纬纱数（行）</label>
            <input type="number" min="1" max="400" :value="p.loom.picks" @change="onResize('picks', $event)" />
          </div>
          <div class="field">
            <label>浮线阈值（点数 ≥）</label>
            <input type="number" min="2" max="400" :value="p.floatThreshold" @change="onThreshold($event)" />
          </div>
          <p class="small">
            同一列上连续经浮点构成经浮线（经纱过长地漂在纬纱之上），同一行上连续纬浮点构成纬浮线；
            达到阈值的格子以红/橙框高亮。
          </p>
        </section>

        <section class="panel">
          <h2>教学样例</h2>
          <div class="btn-row">
            <button v-for="preset in PRESETS" :key="preset.key" @click="store.loadPreset(preset.key)">
              {{ preset.label }}
            </button>
          </div>
          <p class="small">
            「超综框能力」是一张 6 种互异列纹但只有 4 页综框的组织图，
            反推会如实报告无解而不是凑数。
          </p>
        </section>

        <section class="panel">
          <h2>导入 / 导出</h2>
          <div class="btn-row">
            <button @click="exportJSON()">导出 JSON</button>
            <button @click="fileInput?.click()">导入 JSON</button>
          </div>
          <input
            ref="fileInput"
            type="file"
            accept=".json,application/json"
            style="display: none"
            @change="onImport"
          />
          <div class="btn-row">
            <button @click="doExportDraftPNG()">导出意匠图 PNG</button>
            <button @click="exportFabricPNG()">导出织物 PNG</button>
          </div>
          <p class="small">
            JSON 带 weave-studio-json 版本标识，可原样导回；PNG 上用红/蓝双向箭头明确标出经向（水平）与纬向（垂直）。
          </p>
        </section>

        <section class="panel">
          <h2>本地工程库（{{ store.savedProjects.value.length }}）</h2>
          <button class="ghost" @click="store.refreshLibrary()">刷新列表</button>
          <div v-if="store.savedProjects.value.length === 0" class="small" style="margin-top: 8px">
            还没有保存的工程。
          </div>
          <div v-for="item in store.savedProjects.value" :key="item.id" class="library-item">
            <a href="javascript:void(0)" @click="item.id !== undefined && store.open(item.id)" :title="item.name">
              {{ item.name }}
            </a>
            <button v-if="item.id !== undefined" @click="store.remove(item.id)">删</button>
          </div>
        </section>
      </aside>

      <!-- ============ 主栏 ============ -->
      <main>
        <div :class="['banner', consistencyBanner.kind]">
          {{ consistencyBanner.text }}
        </div>

        <section class="panel">
          <h2>协同意匠图</h2>
          <p class="small">
            行均自上而下为纬纱 1…{{ p.loom.picks }}；综框号自下而上（第 1 综在最下）。
            圆点格单选（穿综一列一个点、纹板一纬一个踏板），方块格可拖刷。
            红框＝经浮线，橙框＝纬浮线。
          </p>

          <div class="draft-grid">
            <!-- 穿综 -->
            <div class="draft-block">
              <div class="block-title">穿综（列 = 经纱，行 = 综框；同一列只能穿一页综）</div>
              <GridCanvas
                :rows="p.loom.shafts"
                :cols="p.loom.ends"
                :cell="cellSize"
                marker="circle"
                :bits="threadingBits"
                on-color="#7a1f18"
                @paint="onThreadingPaint"
                @gesture-start="store.beginDrag()"
                @gesture-end="store.endDrag()"
              />
              <ColorStrip
                :colors="p.colors.warp"
                orientation="horizontal"
                :cell="cellSize"
                kind="warp"
                @change="(i, c) => store.setWarpColor(i, c)"
                @gesture-start="store.beginDrag()"
                @gesture-end="store.endColorDrag()"
              />
              <div class="block-title">经纱颜色（仅影响模拟/导出，不影响交织结构）→ 经向</div>
            </div>

            <!-- tie-up：吊综 + 纹板；dobby：多臂纹板（横跨两行视觉占位由组件自身完成） -->
            <div class="draft-block">
              <template v-if="p.mode === 'tieup'">
                <div class="block-title">吊综（行 = 综框，列 = 踏板；黑 = 相连，踩下即提起）</div>
                <GridCanvas
                  :rows="p.loom.shafts"
                  :cols="p.loom.treadles"
                  :cell="cellSize"
                  :bits="tieupBits"
                  @paint="onTieupPaint"
                  @gesture-start="store.beginDrag()"
                  @gesture-end="store.endDrag()"
                />
                <div style="height: 10px"></div>
                <div class="block-title">纹板（行 = 纬纱，每纬选一个踏板）</div>
                <GridCanvas
                  :rows="p.loom.picks"
                  :cols="p.loom.treadles"
                  :cell="cellSize"
                  marker="circle"
                  :bits="treadlingBits"
                  on-color="#1f3a5f"
                  @paint="onTreadlingPaint"
                  @gesture-start="store.beginDrag()"
                  @gesture-end="store.endDrag()"
                />
              </template>
              <template v-else>
                <div class="block-title">多臂纹板（行 = 纬纱，列 = 综框；黑 = 该纬提起此综）</div>
                <GridCanvas
                  :rows="p.loom.picks"
                  :cols="p.loom.shafts"
                  :cell="cellSize"
                  :bits="liftBits"
                  @paint="onLiftPaint"
                  @gesture-start="store.beginDrag()"
                  @gesture-end="store.endDrag()"
                />
              </template>
            </div>

            <!-- 组织图 -->
            <div class="draft-block">
              <div class="block-title">
                组织图（列 = 经纱，行 = 纬纱；深色 = 经浮点。可手绘，手绘后方案不再自动声称一致）
              </div>
              <div class="aligned-row">
                <ColorStrip
                  class="weft-strip"
                  :colors="p.colors.weft"
                  orientation="vertical"
                  :cell="cellSize"
                  kind="weft"
                  @change="(i, c) => store.setWeftColor(i, c)"
                  @gesture-start="store.beginDrag()"
                  @gesture-end="store.endColorDrag()"
                />
                <GridCanvas
                  :rows="p.loom.picks"
                  :cols="p.loom.ends"
                  :cell="cellSize"
                  :bits="p.weave"
                  :marks="store.state.marks"
                  on-color="#7a1f18"
                  off-color="#f4efe6"
                  @paint="onWeavePaint"
                  @gesture-start="store.beginDrag()"
                  @gesture-end="store.endDrag()"
                />
              </div>
              <div class="block-title" style="margin-left: 26px">纬纱颜色（↓ 纬向）</div>
            </div>

            <!-- 右下：分析按钮（tie-up 模式下与纹板同行） -->
            <div class="draft-block" style="justify-content: flex-end; align-self: stretch">
              <div class="block-title">从组织图反推方案</div>
              <button class="primary" :disabled="store.state.analyzing" @click="store.analyze()">
                {{ store.state.analyzing ? 'Worker 计算中…' : '反推穿综 / 纹板' }}
              </button>
              <p class="small">
                允许报告多解（综框/踏板重新编号的等价方案）或无解；所有返回方案都经正算逐位验证。
              </p>
            </div>
          </div>
        </section>

        <!-- 反推结果 -->
        <section v-if="rev" class="panel">
          <h2>反推结果</h2>
          <div v-if="!rev.feasible" class="banner error">
            <strong>无解。</strong>
            {{ rev.reason }}
          </div>
          <template v-else>
            <div class="banner ok">
              <strong>可行。</strong>
              所需综框 {{ rev.shaftsNeeded }} 页（现有 {{ p.loom.shafts }}）
              <template v-if="p.mode === 'tieup'">
                ，所需踏板 {{ rev.treadlesNeeded }} 个（现有 {{ p.loom.treadles }}）。
              </template>
              <br />
              {{ rev.countExplanation }}
            </div>
            <div class="btn-row">
              <button class="primary" @click="store.applyAlternative('canonical')">
                采用规范解（紧凑编号）
              </button>
            </div>
            <div v-if="rev.alternatives.length > 1 || rev.labeledCount !== '1'" class="alt-list">
              <div v-for="(alt, i) in rev.alternatives" :key="i" class="alt-item">
                <span>
                  标号解 #{{ i + 1 }}
                  <span :class="['small', alt.verified ? '' : 'banner error']">
                    {{ alt.verified ? '✓ 正算校验一致' : '✗ 校验失败（不可采用）' }}
                  </span>
                  <span class="mono small">
                    穿综 [{{ alt.threading.join(',') }}]
                    <template v-if="p.mode === 'tieup'">
                      ；纹板 [{{ alt.treadling.join(',') }}]
                    </template>
                  </span>
                </span>
                <button :disabled="!alt.verified" @click="store.applyAlternative(i)">采用</button>
              </div>
            </div>
            <p v-if="rev.alternativesTruncated" class="small">
              标号解总数 {{ rev.labeledCount }} 超过枚举上限，只列出前 {{ rev.alternatives.length }} 个代表；
              计数来自排列公式而非猜测。
            </p>
          </template>
        </section>

        <!-- 织物预览 -->
        <section class="panel">
          <h2>织物交织预览</h2>
          <div class="tabs">
            <button :class="['tab', { active: view === 'fabric' }]" @click="view = 'fabric'">纱线模拟</button>
            <button :class="['tab', { active: view === 'binary' }]" @click="view = 'binary'">二值组织</button>
          </div>
          <div style="margin-top: 10px">
            <FabricPreview v-if="view === 'fabric'" :cell="previewCell" />
            <GridCanvas
              v-else
              :rows="p.loom.picks"
              :cols="p.loom.ends"
              :cell="previewCell"
              :bits="p.weave"
              :marks="store.state.marks"
              on-color="#7a1f18"
              off-color="#f4efe6"
              :disabled="true"
            />
          </div>
          <p class="small" style="margin-top: 8px">
            提示：模拟图中每个格子谁覆盖谁完全由组织图决定，颜色来自独立的经/纬颜色数组；
            修改颜色不会引起结构重算。
          </p>
        </section>
      </main>
    </div>

    <footer class="message-bar">
      <div v-if="store.state.message" :class="['banner', store.state.messageKind === 'error' ? 'error' : 'info']">
        {{ store.state.message }}
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import GridCanvas from './components/GridCanvas.vue'
import ColorStrip from './components/ColorStrip.vue'
import FabricPreview from './components/FabricPreview.vue'
import { store } from './store'
import { PRESETS } from './presets'
import type { Mode } from './types'
import { validateImport } from './db'
import { exportDraftPNG as exportDraftPNGFile, exportFabricPNG as exportFabricPNGFile, exportJSON as exportJSONFile } from './exporter'

const p = computed(() => store.state.project)
const rev = computed(() => store.state.reverse)
const view = ref<'fabric' | 'binary'>('fabric')

const cellSize = computed(() => {
  const { ends, treadles, shafts } = p.value.loom
  const widest = Math.max(ends, treadles, shafts)
  return widest > 40 ? 14 : widest > 24 ? 18 : 24
})
const previewCell = computed(() => (p.value.loom.ends > 60 ? 10 : p.value.loom.ends > 30 ? 14 : 18))

// ---------- 各网格的二值视图（综框号在图上自下而上）----------

const threadingBits = computed(() => {
  const { shafts, ends } = p.value.loom
  const bits = new Array<number>(shafts * ends).fill(0)
  for (let x = 0; x < ends; x++) {
    const s = p.value.threading[x]
    if (s >= 0 && s < shafts) bits[(shafts - 1 - s) * ends + x] = 1
  }
  return bits
})

const tieupBits = computed(() => {
  const { shafts, treadles } = p.value.loom
  const bits = new Array<number>(shafts * treadles).fill(0)
  for (let r = 0; r < shafts; r++) {
    const s = shafts - 1 - r
    for (let t = 0; t < treadles; t++) bits[r * treadles + t] = p.value.tieup[s * treadles + t]
  }
  return bits
})

const treadlingBits = computed(() => {
  const { picks, treadles } = p.value.loom
  const bits = new Array<number>(picks * treadles).fill(0)
  for (let y = 0; y < picks; y++) {
    const t = p.value.treadling[y]
    if (t >= 0 && t < treadles) bits[y * treadles + t] = 1
  }
  return bits
})

const liftBits = computed(() => {
  const { picks, shafts } = p.value.loom
  // 屏幕列自左向右 = 综 shafts..1：第 c 列对应综框号 shafts-1-c
  const bits = new Array<number>(picks * shafts).fill(0)
  for (let y = 0; y < picks; y++) {
    for (let c = 0; c < shafts; c++) {
      bits[y * shafts + c] = p.value.lift[y * shafts + (shafts - 1 - c)]
    }
  }
  return bits
})

// ---------- 交互回写（r/c 是画布格坐标）----------

function onThreadingPaint(r: number, c: number, value: number) {
  const shaft = p.value.loom.shafts - 1 - r
  // 圆点单选格：无论拖刷值如何，点哪个就穿哪页（同列互斥）
  void value
  store.setThreading(c, shaft)
}
function onTieupPaint(r: number, c: number, value: number) {
  const shaft = p.value.loom.shafts - 1 - r
  store.paintTieup(shaft, c, value)
}
function onTreadlingPaint(r: number, c: number) {
  store.setTreadling(r, c)
}
function onLiftPaint(r: number, c: number, value: number) {
  // 屏幕上自左向右是综 shafts..1（与穿综「自下而上是综 1..shafts」一致：c=0 是最后一页综）
  const shaft = p.value.loom.shafts - 1 - c
  store.paintLift(r, shaft, value)
}
function onWeavePaint(r: number, c: number, value: number) {
  store.paintWeave(c, r, value)
}

function onResize(key: 'shafts' | 'treadles' | 'ends' | 'picks', ev: Event) {
  const v = Number((ev.target as HTMLInputElement).value)
  store.resize({ [key]: v } as Partial<Record<typeof key, number>>)
}
function onThreshold(ev: Event) {
  store.setThreshold(Number((ev.target as HTMLInputElement).value))
}

// ---------- 一致性横幅 ----------

const consistencyBanner = computed(() => {
  if (store.state.analyzing) return { kind: 'info', text: '正在 Worker 中做反推分析…' }
  if (p.value.handEdited) {
    return {
      kind: 'warn',
      text: '组织图为手绘/导入状态：穿综与纹板未声称与之一致。可继续手绘（浮线仍会高亮），或点「反推穿综 / 纹板」让 Worker 判定可行、多解或无解。'
    }
  }
  const floatCount = store.state.marks.length
  return {
    kind: 'ok',
    text:
      `方案一致：当前组织图由穿综${p.value.mode === 'tieup' ? ' / 纹板 / 吊综' : ' / 多臂纹板'}正算得到。` +
      (floatCount ? ` 检测到 ${floatCount} 个达到阈值的浮点（见高亮）。` : ' 当前阈值下没有长浮线。')
  }
})

// ---------- 导入导出 ----------

const fileInput = ref<HTMLInputElement | null>(null)

function exportJSON() {
  exportJSONFile(p.value)
}
function doExportDraftPNG() {
  exportDraftPNGFile(p.value, store.state.marks)
}
function exportFabricPNG() {
  exportFabricPNGFile(p.value, store.state.marks)
}

async function onImport(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const text = await file.text()
    const raw = JSON.parse(text)
    const project = validateImport(raw)
    store.loadProject(project)
  } catch (e) {
    store.flash(`导入失败：${(e as Error).message}`, 'error')
  }
}
</script>
