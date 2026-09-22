<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import type { FloatRun, Pattern } from '../core/weave'

const props = defineProps<{
  pattern: Pattern
  warpColors: string[]
  weftColors: string[]
  floats: FloatRun[]
}>()

const CELL = 16
const MARGIN_L = 64 // 经向标识
const MARGIN_T = 40 // 纬向标识
const canvas = ref<HTMLCanvasElement>()

const cols = computed(() => (props.pattern.length > 0 ? props.pattern[0].length : 0))
const rows = computed(() => props.pattern.length)

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

watchEffect(() => {
  const cv = canvas.value
  if (!cv) return
  const w = cols.value
  const h = rows.value
  if (w === 0 || h === 0) return
  const cssW = MARGIN_L + w * CELL + 8
  const cssH = MARGIN_T + h * CELL + 8
  const dpr = window.devicePixelRatio || 1
  cv.width = cssW * dpr
  cv.height = cssH * dpr
  cv.style.width = `${cssW}px`
  cv.style.height = `${cssH}px`
  const ctx = cv.getContext('2d')!
  ctx.scale(dpr, dpr)

  ctx.fillStyle = '#faf7f2'
  ctx.fillRect(0, 0, cssW, cssH)

  // 先画纬纱（在下的一层画纬向长条），再画经纱盖住交织点
  for (let y = 0; y < h; y++) {
    ctx.fillStyle = props.weftColors[y] || '#ccc'
    ctx.fillRect(MARGIN_L, MARGIN_T + y * CELL + 2, w * CELL, CELL - 4)
  }
  for (let x = 0; x < w; x++) {
    ctx.fillStyle = props.warpColors[x] || '#666'
    for (let y = 0; y < h; y++) {
      if (props.pattern[y][x]) {
        // 经纱在上：画一段经纱，两端略微探出以表现“压过”纬纱
        roundRect(ctx, MARGIN_L + x * CELL + 2, MARGIN_T + y * CELL - 1, CELL - 4, CELL + 2, 4)
        ctx.fill()
      }
    }
  }
  // 纬纱在上的格子补一道高光，增强交织感
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!props.pattern[y][x]) {
        ctx.fillStyle = 'rgba(255,255,255,0.18)'
        ctx.fillRect(MARGIN_L + x * CELL, MARGIN_T + y * CELL + 2, CELL, 3)
      }
    }
  }

  // 长浮线高亮
  for (const f of props.floats) {
    const rw = (f.orientation === 'weft' ? f.length : 1) * CELL
    const rh = (f.orientation === 'warp' ? f.length : 1) * CELL
    ctx.strokeStyle = '#e66400'
    ctx.lineWidth = 2
    ctx.setLineDash([4, 3])
    ctx.strokeRect(MARGIN_L + f.x * CELL + 1, MARGIN_T + f.y * CELL + 1, rw - 2, rh - 2)
    ctx.setLineDash([])
  }

  // 方向标识：经向 = 纵向，纬向 = 横向
  ctx.strokeStyle = '#b33900'
  ctx.fillStyle = '#b33900'
  ctx.lineWidth = 2
  const arrow = (x1: number, y1: number, x2: number, y2: number) => {
    const a = Math.atan2(y2 - y1, x2 - x1)
    const s = 7
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.moveTo(x2, y2)
    ctx.lineTo(x2 - s * Math.cos(a - Math.PI / 6), y2 - s * Math.sin(a - Math.PI / 6))
    ctx.moveTo(x2, y2)
    ctx.lineTo(x2 - s * Math.cos(a + Math.PI / 6), y2 - s * Math.sin(a + Math.PI / 6))
    ctx.stroke()
  }
  // 经向（纵向双箭头，左侧）
  const wx = MARGIN_L - 26
  arrow(wx, MARGIN_T + h * CELL - 4, wx, MARGIN_T + 4)
  arrow(wx, MARGIN_T + 4, wx, MARGIN_T + h * CELL - 4)
  ctx.save()
  ctx.translate(wx - 10, MARGIN_T + (h * CELL) / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.textAlign = 'center'
  ctx.font = 'bold 13px sans-serif'
  ctx.fillText('经向 Warp', 0, 0)
  ctx.restore()
  // 纬向（横向双箭头，上方）
  const wy = MARGIN_T - 16
  arrow(MARGIN_L + 4, wy, MARGIN_L + w * CELL - 4, wy)
  arrow(MARGIN_L + w * CELL - 4, wy, MARGIN_L + 4, wy)
  ctx.textAlign = 'center'
  ctx.font = 'bold 13px sans-serif'
  ctx.fillText('纬向 Weft', MARGIN_L + (w * CELL) / 2, wy - 6)
})

defineExpose({
  getCanvas: () => canvas.value,
})
</script>

<template>
  <div class="editor-wrap">
    <div class="editor-title">织物预览（颜色与结构分开存储，此处仅合成显示）</div>
    <canvas ref="canvas" class="preview-canvas" />
    <div class="hint">橙色虚线框 = 超过阈值的长浮线</div>
  </div>
</template>
