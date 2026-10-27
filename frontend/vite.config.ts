/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // `npm run dev:phone`: HTTPS on the local network (port 5181), so a phone on the same
  // Wi-Fi can open the camera for QR scanning — browsers only allow it on secure pages.
  const phone = process.env.DEV_PHONE === '1'
  return {
    plugins: [react(), tailwindcss(), ...(phone ? [basicSsl()] : [])],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: phone ? 5181 : 5180,
      strictPort: true,
      host: phone ? true : undefined,
      // In dev the SPA calls /api on its own origin; Vite forwards to Nest.
      proxy: {
        '/api': { target: env.VITE_DEV_API_PROXY ?? 'http://localhost:4100', changeOrigin: true },
      },
    },
    build: {
      sourcemap: false,
      chunkSizeWarningLimit: 800,
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
    },
  }
})
