<template>
  <canvas
    ref="canvasRef"
    class="grid-canvas"
    :width="size.w * dpr"
    :height="size.h * dpr"
    :style="{ width: size.w + 'px', height: size.h + 'px', cursor: disabled ? 'not-allowed' : 'crosshair' }"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onUp"
    @pointerleave="onUp"
  />
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  gridPixelSize,
  markMap,
  paintGrid,
  PAD_LEFT,
  PAD_TOP
} from '../render'
import type { FloatMark } from '../types'

const props = withDefaults(
  defineProps<{
    rows: number
    cols: number
    /** 行主序二值矩阵，长度须为 rows*cols；决定格子实心与否 */
    bits: number[]
    cell?: number
    /** square = 二值刷涂格；circle = 单选圆点（穿综/纹板） */
    marker?: 'square' | 'circle'
    marks?: FloatMark[]
    onColor?: string
    offColor?: string
    gridColor?: string
    labelColor?: string
    rowLabel?: (r: number) => string
    colLabel?: (c: number) => string
    labelEvery?: number
    disabled?: boolean
  }>(),
  {
    cell: 22,
    marker: 'square',
    marks: undefined,
    onColor: '#26303f',
    offColor: '#fbf8f1',
    gridColor: '#9aa4ad',
    labelColor: '#66707c',
    disabled: false
  }
)

const emit = defineEmits<{
  (e: 'paint', r: number, c: number, value: number): void
  /** 一次拖刷开始/结束，供 store 归并成单个撤销批次 */
  (e: 'gesture-start'): void
  (e: 'gesture-end'): void
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1))
const size = computed(() => gridPixelSize(props.rows, props.cols, props.cell))

let painting = false
let paintValue = 1

function isOn(r: number, c: number): boolean {
  return props.bits[r * props.cols + c] === 1
}

function draw() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, size.value.w, size.value.h)

  paintGrid(ctx, {
    ox: 0,
    oy: 0,
    rows: props.rows,
    cols: props.cols,
    cell: props.cell,
    isOn,
    marker: props.marker,
    onColor: props.onColor,
    offColor: props.offColor,
    gridColor: props.disabled ? '#c7ccd1' : props.gridColor,
    labelColor: props.labelColor,
    marks: props.marks ? markMap(props.marks, props.cols) : undefined,
    rowLabel: props.rowLabel,
    colLabel: props.colLabel,
    labelEvery: props.labelEvery ?? (props.cols > 24 ? 2 : 1)
  })

  if (props.disabled) {
    ctx.fillStyle = 'rgba(150,150,150,0.22)'
    ctx.fillRect(PAD_LEFT, PAD_TOP, props.cols * props.cell, props.rows * props.cell)
  }
}

function hit(ev: PointerEvent): { r: number; c: number } | null {
  const canvas = canvasRef.value
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()
  const x = ev.clientX - rect.left - PAD_LEFT
  const y = ev.clientY - rect.top - PAD_TOP
  const c = Math.floor(x / props.cell)
  const r = Math.floor(y / props.cell)
  if (r < 0 || r >= props.rows || c < 0 || c >= props.cols) return null
  return { r, c }
}

function onDown(ev: PointerEvent) {
  if (props.disabled) return
  const h = hit(ev)
  if (!h) return
  painting = true
  paintValue = isOn(h.r, h.c) ? 0 : 1
  canvasRef.value?.setPointerCapture(ev.pointerId)
  emit('gesture-start')
  emit('paint', h.r, h.c, paintValue)
}

function onMove(ev: PointerEvent) {
  if (!painting || props.disabled) return
  const h = hit(ev)
  if (h) emit('paint', h.r, h.c, paintValue)
}

function onUp(ev: PointerEvent) {
  if (!painting) return
  painting = false
  try {
    canvasRef.value?.releasePointerCapture(ev.pointerId)
  } catch {
    /* 指针可能已释放 */
  }
  emit('gesture-end')
}

onMounted(draw)

watch(
  () => [props.bits, props.rows, props.cols, props.cell, props.marker, props.marks, props.disabled, props.onColor, props.offColor],
  () => draw(),
  { flush: 'post' }
)
</script>

<style scoped>
.grid-canvas {
  display: block;
  touch-action: none;
}
</style>
