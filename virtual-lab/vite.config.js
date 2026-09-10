import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  base: '/',
  resolve: {
    modules: [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(ROOT, 'node_modules'),
      'node_modules',
    ],
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    host: true,
    strictPort: true,
  },
  preview: {
    port: 5173,
    host: true,
  },
})
