import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const watchUsePolling = process.env.VITE_DISABLE_POLLING !== '1'

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: { outDir: 'dist' },
  server: {
    port: 5174,
    watch: {
      usePolling: watchUsePolling,
      interval: 300,
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/.venv/**',
        '**/__pycache__/**',
        '**/.expo/**',
        '**/.pytest_cache/**',
        '**/.mypy_cache/**',
        // Sibling trees in the monorepo (when cwd resolves upward)
        '../../mobile/**',
        '../../services/**',
        '../../node_modules/**',
        '../../dist/**',
      ],
    },
  },
})
