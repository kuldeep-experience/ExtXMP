import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The dev proxy only exists while running `vite` locally. Builds (Vercel, `npm run build`) contain no proxy and no localhost address.
// The deployed app calls VITE_API_URL (default "/api", handled by a rewrite or the same server).
export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    ...(command === 'serve' && { proxy: { '/api': "https://extxmp-production.up.railway.app" } }),
  },
  test: { environment: 'jsdom', setupFiles: './tests/setup.js', globals: true },
}));
