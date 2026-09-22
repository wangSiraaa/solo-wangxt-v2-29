<template>
  <div class="fabric-preview">
    <canvas
      ref="canvasRef"
      :width="cssW * dpr"
      :height="cssH * dpr"
      :style="{ width: cssW + 'px', height: cssH + 'px' }"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { paintFabric } from '../render'
import { store } from '../store'

const props = withDefaults(defineProps<{ cell?: number }>(), { cell: 18 })

const canvasRef = ref<HTMLCanvasElement | null>(null)
const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1))

const cssW = computed(() => store.state.project.loom.ends * props.cell)
const cssH = computed(() => store.state.project.loom.picks * props.cell)

function draw() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, cssW.value, cssH.value)
  paintFabric(ctx, store.state.project, 0, 0, props.cell, store.state.marks)
}

onMounted(draw)
watch(
  () => [
    store.state.project.weave,
    store.state.project.colors.warp,
    store.state.project.colors.weft,
    store.state.project.colors.background,
    store.state.project.loom.ends,
    store.state.project.loom.picks,
    store.state.marks,
    props.cell
  ],
  () => draw(),
  { deep: true, flush: 'post' }
)
</script>

<style scoped>
.fabric-preview {
  overflow: auto;
  max-width: 100%;
  background: #ece7db;
  border: 1px solid #c8c0b0;
  border-radius: 6px;
  padding: 6px;
}
canvas {
  display: block;
}
</style>
