import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/grid-editor/',     // ← 关键：项目页必须加仓库名
  plugins: [react()],
  server: { port: 5173, host: '0.0.0.0' }
})
