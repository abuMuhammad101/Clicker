import path from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const repoRoot = path.resolve(import.meta.dirname, '..')

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // .env lives at the repo root, shared with the backend — not duplicated
  // per app. See CLAUDE.md's two-machine workflow section.
  envDir: repoRoot,
  server: {
    // tokens.css also lives at the repo root, one level above this project;
    // Vite's dev server otherwise refuses to serve files outside its root.
    fs: {
      allow: [repoRoot],
    },
  },
})
