import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Base path: root in dev, repo subpath on GitHub Pages (set VITE_BASE at build).
// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
})
