import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // EODHD doesn't send Access-Control-Allow-Origin, so browser blocks direct calls.
      // This proxy routes /api/eodhd/* to eodhd.com in dev mode.
      // In Tauri production builds, the native webview doesn't enforce CORS.
      '/api/eodhd': {
        target: 'https://eodhd.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/eodhd/, '/api'),
      },
      // SEC www.sec.gov — ticker map file (no CORS headers).
      // SEC requires User-Agent with contact info for all automated requests.
      '/api/sec': {
        target: 'https://www.sec.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/sec/, ''),
        headers: {
          'User-Agent': 'StockAnalyzer/1.0 kylehoff@example.com',
          'Accept-Encoding': 'identity',
        },
      },
      // SEC data.sec.gov — XBRL company facts API.
      // Has CORS headers but requires proper User-Agent.
      // Browser can't set User-Agent (forbidden header), so proxy in dev.
      '/api/edgar': {
        target: 'https://data.sec.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/edgar/, ''),
        headers: {
          'User-Agent': 'StockAnalyzer/1.0 kylehoff@example.com',
          'Accept-Encoding': 'identity',
        },
      },
    },
  },
})
