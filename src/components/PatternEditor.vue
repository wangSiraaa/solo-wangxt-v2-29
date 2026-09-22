<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import type { FloatRun, Pattern } from '../core/weave'

const props = defineProps<{
  pattern: Pattern
  floats: FloatRun[]
  dirty: boolean
  busy: boolean
}>()

const emit = defineEmits<{
  (e: 'edit', edits: { x: number; y: number; value: boolean }[]): void
}>()

const CELL = 18
const canvas = ref<HTMLCanvasElement>()

const cols = computed(() => (props.pattern.length > 0 ? props.pattern[0].length : 0))
const rows = computed(() => props.pattern.length)

let painting = false
let paintValue = false
let pending: { x: number; y: number; value: boolean }[] = []

function cellFromEvent(e: PointerEvent): { x: number; y: number } | null {
  const cv = canvas.value
  if (!cv) return null
  const rect = cv.getBoundingClientRect()
  const x = Math.floor((e.clientX - rect.left) / CELL)
  const y = Math.floor((e.clientY - rect.top) / CELL)
  if (x < 0 || y < 0 || x >= cols.value || y >= rows.value) return null
  return { x, y }
}

function flush(): void {
  if (pending.length > 0) {
    emit('edit', pending)
    pending = []
  }
}

function onPointerDown(e: PointerEvent): void {
  const c = cellFromEvent(e)
  if (!c) return
  painting = true
  paintValue = !props.pattern[c.y][c.x]
  pending = [{ ...c, value: paintValue }]
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent): void {
  if (!painting) return
  const c = cellFromEvent(e)
  if (!c) return
  const last = pending[pending.length - 1]
  if (last && last.x === c.x && last.y === c.y) return
  pending.push({ ...c, value: paintValue })
  if (pending.length >= 12) flush() // 拖动中分批生效，画面即时反馈
}

function onPointerUp(): void {
  if (!painting) return
  painting = false
  flush()
}

watchEffect(() => {
  const cv = canvas.value
  if (!cv) return
  const w = cols.value
  const h = rows.value
  if (w === 0 || h === 0) return
  const dpr = window.devicePixelRatio || 1
  cv.width = w * CELL * dpr
  cv.height = h * CELL * dpr
  cv.style.width = `${w * CELL}px`
  cv.style.height = `${h * CELL}px`
  const ctx = cv.getContext('2d')!
  ctx.scale(dpr, dpr)

  // 组织点
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      ctx.fillStyle = props.pattern[y][x] ? '#2b2b2b' : '#ffffff'
      ctx.fillRect(x * CELL, y * CELL, CELL, CELL)
    }
  }

  // 网格线
  ctx.strokeStyle = '#cfcfcf'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = 0; i <= w; i++) {
    ctx.moveTo(i * CELL + 0.5, 0)
    ctx.lineTo(i * CELL + 0.5, h * CELL)
  }
  for (let j = 0; j <= h; j++) {
    ctx.moveTo(0, j * CELL + 0.5)
    ctx.lineTo(w * CELL, j * CELL + 0.5)
  }
  ctx.stroke()

  // 长浮线高亮
  for (const f of props.floats) {
    const rw = (f.orientation === 'weft' ? f.length : 1) * CELL
    const rh = (f.orientation === 'warp' ? f.length : 1) * CELL
    ctx.fillStyle = 'rgba(255, 122, 0, 0.20)'
    ctx.fillRect(f.x * CELL, f.y * CELL, rw, rh)
    ctx.strokeStyle = '#e66400'
    ctx.lineWidth = 2
    ctx.strokeRect(f.x * CELL + 1, f.y * CELL + 1, rw - 2, rh - 2)
  }

  // 未同步状态外框
  if (props.dirty) {
    ctx.strokeStyle = '#d97706'
    ctx.lineWidth = 3
    ctx.setLineDash([6, 4])
    ctx.strokeRect(1.5, 1.5, w * CELL - 3, h * CELL - 3)
    ctx.setLineDash([])
  }
})
</script>

<template>
  <div class="editor-wrap">
    <div class="editor-title">
      组织图
      <span v-if="busy" class="tag busy">反推计算中…</span>
      <span v-else-if="dirty" class="tag dirty">未同步</span>
    </div>
    <canvas
      ref="canvas"
      class="grid-canvas"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    />
    <div class="hint">点击/拖动切换组织点，松手后自动反推穿综与纹板</div>
  </div>
</template>
