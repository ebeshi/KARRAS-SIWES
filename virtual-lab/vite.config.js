import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const wasmsharpAssets = {
  name: 'wasmsharp-wasm-assets',
  enforce: 'pre',
  resolveId(source, importer) {
    if (source === './dotnet.native.wasm' && importer?.includes('@wasmsharp/core')) {
      return `${path.resolve(path.dirname(importer), source)}?url`
    }
    return null
  },
  transform(code, id) {
    if (id.includes('@wasmsharp/core') && code.includes('"./dotnet.native.wasm"')) {
      return code.replace(
        'from "./dotnet.native.wasm"',
        'from "./dotnet.native.wasm?url"',
      )
    }
    return null
  },
}

export default defineConfig({
  root: __dirname,
  plugins: [wasmsharpAssets, react()],
  base: '/',
  assetsInclude: ['**/*.dll', '**/*.dat'],
  resolve: {
    modules: [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(ROOT, 'node_modules'),
      'node_modules',
    ],
  },
  optimizeDeps: {
    exclude: ['@wasmsharp/core'],
  },
  worker: {
    format: 'es',
    plugins: () => [wasmsharpAssets],
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    commonjsOptions: {
      exclude: ['**/node_modules/@wasmsharp/core/**'],
    },
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
