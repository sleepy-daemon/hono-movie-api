import { defineConfig } from 'vitest/config'

// Tests live under src/, not under docs/ (which is Vite's SPA root). Vitest
// picks up vite.config.ts by default — this file overrides that so test
// discovery runs from the project root.
export default defineConfig({
  root: '.',
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    environment: 'node',
  },
})
