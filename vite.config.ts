import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: true,
    exclude: ['**/node_modules/**', '**/tests/e2e/**'],
  },
  build: {
    target: 'es2022',
  },
  esbuild: {
    target: 'es2022',
    keepNames: true,
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'es2022',
      keepNames: true,
    },
  },
})
