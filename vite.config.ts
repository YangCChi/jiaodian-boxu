import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/maplibre-gl')) return 'maplibre';
          if (id.includes('node_modules/react') || id.includes('node_modules/lucide-react')) {
            return 'vendor-ui';
          }
          if (id.includes('xipuOsmData.json')) return 'xipu-osm-data';
        },
      },
    },
  },
});
