import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' giúp chạy được cả trên GitHub Pages (/<repo>/) lẫn Vercel/Netlify
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { chunkSizeWarningLimit: 3000 },
})
