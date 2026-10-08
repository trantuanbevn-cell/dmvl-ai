import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { writeFileSync, mkdirSync } from 'node:fs'

// Mỗi lần build có một mã phiên bản; ghi vào dist/version.json để các máy đang mở so sánh và báo “có bản cập nhật”
const BUILD_ID = process.env.GITHUB_SHA?.slice(0, 8) ?? String(Date.now())
const BUILD_TIME = new Date().toISOString()
const versionFile = () => ({
  name: 'version-file',
  closeBundle() { mkdirSync('dist', { recursive: true }); writeFileSync('dist/version.json', JSON.stringify({ id: BUILD_ID, time: BUILD_TIME })) },
})

// base: './' giúp chạy được cả trên GitHub Pages (/<repo>/) lẫn Vercel/Netlify
export default defineConfig({
  plugins: [react(), versionFile()],
  base: './',
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  build: { chunkSizeWarningLimit: 3000 },
})
