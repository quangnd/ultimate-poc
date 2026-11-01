import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Loopback only (ADR-001 §4). The proxy keeps Host as 127.0.0.1:5173, which the API's loopback check accepts.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:5174' },
  },
  preview: { host: '127.0.0.1' },
})
