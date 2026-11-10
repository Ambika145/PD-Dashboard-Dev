import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Builds one self-contained HTML file the team can open by double-clicking
// or keep in SharePoint — no server needed.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 6000,
  },
});
