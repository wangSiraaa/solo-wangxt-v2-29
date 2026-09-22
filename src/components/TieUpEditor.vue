<script setup lang="ts">
import { ref, watchEffect } from 'vue'

const props = defineProps<{
  /** tieUp[踏板][综框] */
  tieUp: boolean[][]
  shaftCount: number
  treadleCount: number
}>()

const emit = defineEmits<{
  (e: 'edit', edits: { treadle: number; shaft: number; value: boolean }[]): void
}>()

const CELL = 18
const canvas = ref<HTMLCanvasElement>()

let painting = false
let paintValue = false
let pending: { treadle: number; shaft: number; value: boolean }[] = []

function locate(e: PointerEvent): { treadle: number; shaft: number } | null {
  const cv = canvas.value
  if (!cv) return null
  const rect = cv.getBoundingClientRect()
  const col = Math.floor((e.clientX - rect.left) / CELL)
  const row = Math.floor((e.clientY - rect.top) / CELL)
  if (col < 0 || col >= props.treadleCount || row < 0 || row >= props.shaftCount) return null
  // 列 = 踏板，行 = 综框（自上而下 0..N-1）
  return { treadle: col, shaft: row }
}

function flush(): void {
  if (pending.length > 0) {
    emit('edit', pending)
    pending = []
  }
}

function onPointerDown(e: PointerEvent): void {
  const loc = locate(e)
  if (!loc) return
  painting = true
  paintValue = !(props.tieUp[loc.treadle] && props.tieUp[loc.treadle][loc.shaft])
  pending = [{ ...loc, value: paintValue }]
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent): void {
  if (!painting) return
  const loc = locate(e)
  if (!loc) return
  const last = pending[pending.length - 1]
  if (last && last.treadle === loc.treadle && last.shaft === loc.shaft) return
  pending.push({ ...loc, value: paintValue })
  if (pending.length >= 12) flush()
}

function onPointerUp(): void {
  if (!painting) return
  painting = false
  flush()
}

watchEffect(() => {
  const cv = canvas.value
  if (!cv) return
  const T = props.treadleCount
  const S = props.shaftCount
  if (T === 0 || S === 0) return
  const cssW = T * CELL
  const cssH = S * CELL
  const dpr = window.devicePixelRatio || 1
  cv.width = cssW * dpr
  cv.height = cssH * dpr
  cv.style.width = `${cssW}px`
  cv.style.height = `${cssH}px`
  const ctx = cv.getContext('2d')!
  ctx.scale(dpr, dpr)

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, cssW, cssH)
  for (let t = 0; t < T; t++) {
    for (let s = 0; s < S; s++) {
      if (props.tieUp[t] && props.tieUp[t][s]) {
        ctx.fillStyle = '#2b2b2b'
        ctx.fillRect(t * CELL + 2, s * CELL + 2, CELL - 4, CELL - 4)
      }
    }
  }
  ctx.strokeStyle = '#cfcfcf'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = 0; i <= T; i++) {
    ctx.moveTo(i * CELL + 0.5, 0)
    ctx.lineTo(i * CELL + 0.5, cssH)
  }
  for (let j = 0; j <= S; j++) {
    ctx.moveTo(0, j * CELL + 0.5)
    ctx.lineTo(cssW, j * CELL + 0.5)
  }
  ctx.stroke()
})
</script>

<template>
  <div class="editor-wrap">
    <div class="editor-title">纹板图</div>
    <canvas
      ref="canvas"
      class="grid-canvas"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    />
    <div class="hint">列 = 踏板，行 = 综框；黑格 = 该踏板提起该综</div>
  </div>
</template>
