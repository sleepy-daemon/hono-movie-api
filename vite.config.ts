import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Docs is a tiny SPA that lives under /docs on the API server. Vite reads from
// docs/, builds to docs-dist/, and Hono serves the result via serveStatic.
export default defineConfig({
  root: 'docs',
  base: '/docs/',
  plugins: [react()],
  build: {
    outDir: '../docs-dist',
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy the openapi spec during `npm run docs:dev` so the SPA has
      // something to fetch without starting the API through Vite.
      '/openapi.json': 'http://localhost:4000',
    },
  },
})
