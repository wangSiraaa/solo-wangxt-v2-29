<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'

const props = defineProps<{
  threading: number[]
  shaftCount: number
  warpColors: string[]
  selectedColor: string
}>()

const emit = defineEmits<{
  (e: 'edit', edits: { x: number; shaft: number }[]): void
  (e: 'color', edits: { x: number; color: string }[]): void
}>()

const CELL = 18
const STRIP = 14
const GAP = 4
const canvas = ref<HTMLCanvasElement>()

const ends = computed(() => props.threading.length)
const gridTop = STRIP + GAP

let painting = false
let pendingThread: { x: number; shaft: number }[] = []
let pendingColor: { x: number; color: string }[] = []
let mode: 'thread' | 'color' = 'thread'

function locate(e: PointerEvent): { x: number; shaft: number } | { x: number; strip: true } | null {
  const cv = canvas.value
  if (!cv) return null
  const rect = cv.getBoundingClientRect()
  const px = e.clientX - rect.left
  const py = e.clientY - rect.top
  const x = Math.floor(px / CELL)
  if (x < 0 || x >= ends.value) return null
  if (py >= 0 && py < STRIP) return { x, strip: true }
  const row = Math.floor((py - gridTop) / CELL)
  if (row < 0 || row >= props.shaftCount) return null
  // 行自上而下对应综框 0..N-1
  return { x, shaft: row }
}

function flush(): void {
  if (pendingThread.length > 0) {
    emit('edit', pendingThread)
    pendingThread = []
  }
  if (pendingColor.length > 0) {
    emit('color', pendingColor)
    pendingColor = []
  }
}

function onPointerDown(e: PointerEvent): void {
  const loc = locate(e)
  if (!loc) return
  painting = true
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  if ('strip' in loc) {
    mode = 'color'
    pendingColor = [{ x: loc.x, color: props.selectedColor }]
  } else {
    mode = 'thread'
    pendingThread = [{ x: loc.x, shaft: loc.shaft }]
  }
}

function onPointerMove(e: PointerEvent): void {
  if (!painting) return
  const loc = locate(e)
  if (!loc) return
  if (mode === 'color' && 'strip' in loc) {
    if (!pendingColor.some((p) => p.x === loc.x)) {
      pendingColor.push({ x: loc.x, color: props.selectedColor })
    }
  } else if (mode === 'thread' && 'shaft' in loc) {
    const last = pendingThread[pendingThread.length - 1]
    if (!last || last.x !== loc.x) pendingThread.push({ x: loc.x, shaft: loc.shaft })
  }
}

function onPointerUp(): void {
  if (!painting) return
  painting = false
  flush()
}

watchEffect(() => {
  const cv = canvas.value
  if (!cv) return
  const w = ends.value
  const S = props.shaftCount
  if (w === 0 || S === 0) return
  const cssW = w * CELL
  const cssH = gridTop + S * CELL
  const dpr = window.devicePixelRatio || 1
  cv.width = cssW * dpr
  cv.height = cssH * dpr
  cv.style.width = `${cssW}px`
  cv.style.height = `${cssH}px`
  const ctx = cv.getContext('2d')!
  ctx.scale(dpr, dpr)

  // 经纱颜色条
  for (let x = 0; x < w; x++) {
    ctx.fillStyle = props.warpColors[x] || '#999'
    ctx.fillRect(x * CELL, 0, CELL, STRIP)
  }
  ctx.strokeStyle = '#bbb'
  ctx.strokeRect(0, 0.5, cssW, STRIP)

  // 穿综格
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, gridTop, cssW, S * CELL)
  for (let x = 0; x < w; x++) {
    const s = props.threading[x]
    if (s >= 0 && s < S) {
      ctx.fillStyle = '#2b2b2b'
      ctx.fillRect(x * CELL + 2, gridTop + s * CELL + 2, CELL - 4, CELL - 4)
    }
  }
  ctx.strokeStyle = '#cfcfcf'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = 0; i <= w; i++) {
    ctx.moveTo(i * CELL + 0.5, gridTop)
    ctx.lineTo(i * CELL + 0.5, gridTop + S * CELL)
  }
  for (let j = 0; j <= S; j++) {
    ctx.moveTo(0, gridTop + j * CELL + 0.5)
    ctx.lineTo(cssW, gridTop + j * CELL + 0.5)
  }
  ctx.stroke()
})
</script>

<template>
  <div class="editor-wrap">
    <div class="editor-title">穿综图</div>
    <canvas
      ref="canvas"
      class="grid-canvas"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    />
    <div class="hint">行 = 综框（自上而下 1..{{ shaftCount }}），顶部色条 = 经纱颜色</div>
  </div>
</template>
