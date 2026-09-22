<script setup lang="ts">
import { onMounted, ref } from 'vue'
import PatternEditor from './components/PatternEditor.vue'
import ThreadingEditor from './components/ThreadingEditor.vue'
import TieUpEditor from './components/TieUpEditor.vue'
import TreadlingEditor from './components/TreadlingEditor.vue'
import FabricPreview from './components/FabricPreview.vue'
import * as store from './store/projectStore'
import { downloadText, exportCanvasPng, exportDraftPng } from './core/exporter'
import { LIMITS } from './core/types'

const previewRef = ref<InstanceType<typeof FabricPreview>>()
const fileInput = ref<HTMLInputElement>()

onMounted(() => {
  void store.init()
})

function onExportJson(): void {
  downloadText(`${store.project.name}.weave.json`, store.exportProjectJson())
}

function onImportClick(): void {
  fileInput.value?.click()
}

async function onImportFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    await store.importProjectJson(await file.text())
  } catch (err) {
    store.notice.value = { kind: 'error', text: String(err), details: [] }
  }
}

function onExportDraftPng(): void {
  exportDraftPng(JSON.parse(JSON.stringify(store.project)), store.pattern.value, store.floatThreshold.value)
}

function onExportPreviewPng(): void {
  const cv = previewRef.value?.getCanvas()
  if (cv) exportCanvasPng(cv, `${store.project.name}-织物预览.png`)
}

function onCountInput(field: 'warpEnds' | 'weftPicks' | 'shafts' | 'treadles', e: Event): void {
  const v = Number((e.target as HTMLInputElement).value)
  if (!Number.isFinite(v)) return
  store.resizeProject({ [field]: v })
}

function runNoticeAction(): void {
  const n = store.notice.value
  if (n && n.action) n.action.run()
}

async function onOpenProject(e: Event): Promise<void> {
  const id = (e.target as HTMLSelectElement).value
  if (id) await store.openProject(id)
}

async function onDeleteProject(): Promise<void> {
  if (window.confirm(`确定删除工程「${store.project.name}」？此操作不可恢复。`)) {
    await store.deleteProject(store.project.id)
  }
}
</script>

<template>
  <div class="app">
    <header class="app-header">
      <h1>经纬组织设计台</h1>
      <div class="project-bar">
        <select :value="store.project.id" @change="onOpenProject" title="打开工程">
          <option v-for="p in store.projectList.value" :key="p.id" :value="p.id">
            {{ p.name }}（{{ new Date(p.updatedAt).toLocaleString() }}）
          </option>
        </select>
        <input
          class="name-input"
          :value="store.project.name"
          @change="(e) => store.renameProject((e.target as HTMLInputElement).value)"
        />
        <button @click="store.newProject">新建</button>
        <button class="danger" @click="onDeleteProject">删除</button>
        <span class="save-state">{{ store.saveState.value === 'saved' ? '已保存到本地' : '保存中…' }}</span>
      </div>
    </header>

    <div class="toolbar">
      <div class="group">
        <span class="group-label">预设</span>
        <button @click="store.loadPreset('plain')">平纹</button>
        <button @click="store.loadPreset('twill')">2/2 斜纹</button>
        <button @click="store.loadPreset('satin8')" title="需要 8 页综，用于演示超过综框能力时的无解报告">
          八枚缎纹（需 8 综）
        </button>
      </div>
      <div class="group">
        <span class="group-label">规格</span>
        <label>经纱
          <input type="number" :value="store.project.threading.length"
            :min="LIMITS.minEnds" :max="LIMITS.maxEnds"
            @change="(e) => onCountInput('warpEnds', e)" />
        </label>
        <label>纬纱
          <input type="number" :value="store.project.treadling.length"
            :min="LIMITS.minPicks" :max="LIMITS.maxPicks"
            @change="(e) => onCountInput('weftPicks', e)" />
        </label>
        <label>综框
          <input type="number" :value="store.project.shaftCount"
            :min="LIMITS.minShafts" :max="LIMITS.maxShafts"
            @change="(e) => onCountInput('shafts', e)" />
        </label>
        <label>踏板
          <input type="number" :value="store.project.treadleCount"
            :min="LIMITS.minTreadles" :max="LIMITS.maxTreadles"
            @change="(e) => onCountInput('treadles', e)" />
        </label>
        <label>长浮线 ≥
          <input type="number" v-model.number="store.floatThreshold.value" min="2" max="16" />
        </label>
      </div>
      <div class="group">
        <span class="group-label">颜色（独立于结构）</span>
        <button
          v-for="c in store.palette"
          :key="c"
          class="swatch"
          :class="{ active: store.selectedColor.value === c }"
          :style="{ background: c }"
          @click="store.selectedColor.value = c"
        />
      </div>
      <div class="group">
        <button :disabled="!store.canUndo.value" :title="store.undoLabel.value" @click="store.undo">
          撤销{{ store.undoLabel.value ? `：${store.undoLabel.value}` : '' }}
        </button>
        <button :disabled="!store.canRedo.value" @click="store.redo">重做</button>
      </div>
      <div class="group">
        <button @click="onExportJson">导出 JSON</button>
        <button @click="onImportClick">导入 JSON</button>
        <button @click="onExportDraftPng">导出意匠图 PNG</button>
        <button @click="onExportPreviewPng">导出预览 PNG</button>
        <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="onImportFile" />
      </div>
    </div>

    <div v-if="store.notice.value" class="notice" :class="store.notice.value.kind">
      <div class="notice-main">
        <strong>{{ store.notice.value.text }}</strong>
        <ul v-if="store.notice.value.details.length">
          <li v-for="(d, i) in store.notice.value.details" :key="i">{{ d }}</li>
        </ul>
      </div>
      <div class="notice-actions">
        <button
          v-if="store.notice.value.action"
          @click="runNoticeAction"
        >
          {{ store.notice.value.action.label }}
        </button>
        <button v-if="store.patternDirty.value" @click="store.discardPatternEdits">放弃未同步修改</button>
        <button @click="store.dismissNotice">关闭</button>
      </div>
    </div>

    <main class="workspace">
      <section class="draft-grid">
        <div class="cell-threading">
          <ThreadingEditor
            :threading="store.project.threading"
            :shaft-count="store.project.shaftCount"
            :warp-colors="store.project.warpColors"
            :selected-color="store.selectedColor.value"
            @edit="store.applyThreadingEdits"
            @color="store.applyWarpColors"
          />
        </div>
        <div class="cell-tieup">
          <TieUpEditor
            :tie-up="store.project.tieUp"
            :shaft-count="store.project.shaftCount"
            :treadle-count="store.project.treadleCount"
            @edit="store.applyTieUpEdits"
          />
        </div>
        <div class="cell-pattern">
          <PatternEditor
            :pattern="store.displayPattern.value"
            :floats="store.floats.value"
            :dirty="store.patternDirty.value"
            :busy="store.solving.value"
            @edit="store.applyPatternEdits"
          />
        </div>
        <div class="cell-treadling">
          <TreadlingEditor
            :treadling="store.project.treadling"
            :treadle-count="store.project.treadleCount"
            :weft-colors="store.project.weftColors"
            :selected-color="store.selectedColor.value"
            @edit="store.applyTreadlingEdits"
            @color="store.applyWeftColors"
          />
        </div>
      </section>

      <section class="preview-section">
        <FabricPreview
          ref="previewRef"
          :pattern="store.displayPattern.value"
          :warp-colors="store.project.warpColors"
          :weft-colors="store.project.weftColors"
          :floats="store.floats.value"
        />
      </section>
    </main>
  </div>
</template>
