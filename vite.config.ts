import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// base './' = funziona su GitHub Pages in qualsiasi sotto-cartella
export default defineConfig({
  plugins: [react()],
  base: './',
})
