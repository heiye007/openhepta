import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  root: 'electron-renderer',
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'electron-renderer/src'),
      '@renderer': path.resolve(__dirname, 'electron-renderer/src'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'lucide-react',
      'prosemirror-commands',
      'prosemirror-history',
      'prosemirror-inputrules',
      'prosemirror-keymap',
      'prosemirror-markdown',
      'prosemirror-model',
      'prosemirror-schema-basic',
      'prosemirror-schema-list',
      'prosemirror-state',
      'prosemirror-tables',
      'prosemirror-transform',
      'prosemirror-view',
      'katex',
      'epubjs',
      'jszip',
    ],
    exclude: ['pdfjs-dist'],
  },
  build: {
    outDir: '../dist-renderer',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/pdfjs-dist')) return 'vendor-pdfjs';
          if (id.includes('node_modules/epubjs') || id.includes('node_modules/jszip')) {
            return 'vendor-epub';
          }
          if (id.includes('node_modules/prosemirror-')) return 'vendor-prosemirror';
          if (id.includes('node_modules/katex')) return 'vendor-katex';
          if (id.includes('node_modules/lucide-react')) return 'vendor-icons';
          if (id.includes('node_modules/react')) return 'vendor-react';
          return undefined;
        },
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    warmup: {
      clientFiles: ['./src/main.tsx', './src/App.tsx'],
    },
    watch: {
      ignored: [
        '**/dist-electron/**',
        '**/dist-renderer/**',
        '**/lint-rules/**',
        '**/cli/**',
      ],
    },
  },
});
