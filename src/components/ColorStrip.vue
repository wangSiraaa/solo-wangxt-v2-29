<template>
  <div class="color-strip" :class="orientation" :style="stripStyle">
    <div
      v-for="(c, i) in colors"
      :key="i"
      class="swatch"
      :style="{ width: cell + 'px', height: cell + 'px', background: c }"
      :title="label(i)"
    >
      <input
        type="color"
        :value="c"
        @pointerdown="emit('gesture-start')"
        @change="emit('gesture-end')"
        @input="emit('change', i, ($event.target as HTMLInputElement).value)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    colors: string[]
    orientation?: 'horizontal' | 'vertical'
    cell?: number
    kind: 'warp' | 'weft'
  }>(),
  { orientation: 'horizontal', cell: 22 }
)

const emit = defineEmits<{
  (e: 'change', index: number, color: string): void
  (e: 'gesture-start'): void
  (e: 'gesture-end'): void
}>()

const stripStyle = computed(() =>
  props.orientation === 'horizontal'
    ? ({ marginLeft: '26px', display: 'flex' } as const)
    : ({ display: 'flex', flexDirection: 'column' } as const)
)

function label(i: number) {
  return `${props.kind === 'warp' ? '经纱' : '纬纱'} ${i + 1}`
}
</script>

<style scoped>
.color-strip {
  gap: 0;
}
.swatch {
  position: relative;
  border: 1px solid rgba(0, 0, 0, 0.25);
  box-sizing: border-box;
}
.swatch input[type='color'] {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  width: 100%;
  height: 100%;
}
</style>
