import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Loopback only (ADR-001 §4). The proxy keeps Host as 127.0.0.1:5173, which the API's loopback check accepts.
// API_PORT lets the E2E run (playwright.config.ts) point its own dev server at its own API.
const apiPort = process.env.API_PORT ?? '5174'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/api': `http://127.0.0.1:${apiPort}` },
  },
  preview: { host: '127.0.0.1' },
})
