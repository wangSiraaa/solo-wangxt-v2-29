/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: './',
  worker: { format: 'es' },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
