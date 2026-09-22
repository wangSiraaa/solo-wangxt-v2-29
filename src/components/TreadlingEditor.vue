<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'

const props = defineProps<{
  treadling: number[]
  treadleCount: number
  weftColors: string[]
  selectedColor: string
}>()

const emit = defineEmits<{
  (e: 'edit', edits: { y: number; treadle: number }[]): void
  (e: 'color', edits: { y: number; color: string }[]): void
}>()

const CELL = 18
const STRIP = 14
const GAP = 4
const canvas = ref<HTMLCanvasElement>()

const picks = computed(() => props.treadling.length)
const stripLeft = computed(() => props.treadleCount * CELL + GAP)

let painting = false
let pendingTreadle: { y: number; treadle: number }[] = []
let pendingColor: { y: number; color: string }[] = []
let mode: 'treadle' | 'color' = 'treadle'

function locate(e: PointerEvent): { y: number; treadle: number } | { y: number; strip: true } | null {
  const cv = canvas.value
  if (!cv) return null
  const rect = cv.getBoundingClientRect()
  const px = e.clientX - rect.left
  const py = e.clientY - rect.top
  const y = Math.floor(py / CELL)
  if (y < 0 || y >= picks.value) return null
  if (px >= stripLeft.value && px < stripLeft.value + STRIP) return { y, strip: true }
  const t = Math.floor(px / CELL)
  if (t < 0 || t >= props.treadleCount) return null
  return { y, treadle: t }
}

function flush(): void {
  if (pendingTreadle.length > 0) {
    emit('edit', pendingTreadle)
    pendingTreadle = []
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
    pendingColor = [{ y: loc.y, color: props.selectedColor }]
  } else {
    mode = 'treadle'
    pendingTreadle = [{ y: loc.y, treadle: loc.treadle }]
  }
}

function onPointerMove(e: PointerEvent): void {
  if (!painting) return
  const loc = locate(e)
  if (!loc) return
  if (mode === 'color' && 'strip' in loc) {
    if (!pendingColor.some((p) => p.y === loc.y)) {
      pendingColor.push({ y: loc.y, color: props.selectedColor })
    }
  } else if (mode === 'treadle' && 'treadle' in loc) {
    const last = pendingTreadle[pendingTreadle.length - 1]
    if (!last || last.y !== loc.y) pendingTreadle.push({ y: loc.y, treadle: loc.treadle })
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
  const h = picks.value
  const T = props.treadleCount
  if (h === 0 || T === 0) return
  const cssW = stripLeft.value + STRIP
  const cssH = h * CELL
  const dpr = window.devicePixelRatio || 1
  cv.width = cssW * dpr
  cv.height = cssH * dpr
  cv.style.width = `${cssW}px`
  cv.style.height = `${cssH}px`
  const ctx = cv.getContext('2d')!
  ctx.scale(dpr, dpr)

  // 踏板格
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, T * CELL, cssH)
  for (let y = 0; y < h; y++) {
    const t = props.treadling[y]
    if (t >= 0 && t < T) {
      ctx.fillStyle = '#2b2b2b'
      ctx.fillRect(t * CELL + 2, y * CELL + 2, CELL - 4, CELL - 4)
    }
  }
  ctx.strokeStyle = '#cfcfcf'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = 0; i <= T; i++) {
    ctx.moveTo(i * CELL + 0.5, 0)
    ctx.lineTo(i * CELL + 0.5, cssH)
  }
  for (let j = 0; j <= h; j++) {
    ctx.moveTo(0, j * CELL + 0.5)
    ctx.lineTo(T * CELL, j * CELL + 0.5)
  }
  ctx.stroke()

  // 纬纱颜色条
  for (let y = 0; y < h; y++) {
    ctx.fillStyle = props.weftColors[y] || '#999'
    ctx.fillRect(stripLeft.value, y * CELL, STRIP, CELL)
  }
  ctx.strokeStyle = '#bbb'
  ctx.strokeRect(stripLeft.value + 0.5, 0, STRIP, cssH)
})
</script>

<template>
  <div class="editor-wrap">
    <div class="editor-title">踏板顺序图</div>
    <canvas
      ref="canvas"
      class="grid-canvas"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    />
    <div class="hint">行 = 纬纱，列 = 踏板；右侧色条 = 纬纱颜色</div>
  </div>
</template>
