import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  base: '/media-pipe',
  build: {
    outDir: 'docs',
  },
  plugins: [tailwindcss(), react()],
});
