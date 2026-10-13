import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'

// Mỗi lần build có một mã phiên bản; ghi vào dist/version.json để các máy đang mở so sánh và báo “có bản cập nhật”
const BUILD_ID = process.env.GITHUB_SHA?.slice(0, 8) ?? String(Date.now())
const BUILD_TIME = new Date().toISOString()
// release.json: { scope?: 'concept' | ..., note?: string } – scope = khoá tính năng (features.ts); chỉ người có quyền đó mới thấy thông báo cập nhật. silent:true = cập nhật ngầm, KHÔNG hiện thông báo cho ai (người dùng tự nhận bản mới khi tải lại trang). Không có/để trống = báo mọi người.
let rel: { scope?: string; note?: string; silent?: boolean } = {}
try { rel = JSON.parse(readFileSync('release.json', 'utf8')) } catch { /* mặc định: báo mọi người */ }
const versionFile = () => ({
  name: 'version-file',
  closeBundle() { mkdirSync('dist', { recursive: true }); writeFileSync('dist/version.json', JSON.stringify({ id: BUILD_ID, time: BUILD_TIME, scope: rel.scope || undefined, note: rel.note || undefined, silent: rel.silent || undefined })) },
})

// base: './' giúp chạy được cả trên GitHub Pages (/<repo>/) lẫn Vercel/Netlify
export default defineConfig({
  plugins: [react(), versionFile()],
  base: './',
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  build: { chunkSizeWarningLimit: 3000, sourcemap: false },
  esbuild: { drop: ['console', 'debugger'], legalComments: 'none' },
})
