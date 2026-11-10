import { defineConfig } from 'vite';

// Build board React thành một file tĩnh để Flask tiếp tục phục vụ giao diện.
export default defineConfig({
  build: {
    lib: {
      entry: 'src/deal-board.jsx',
      name: 'NexusDealBoard',
      formats: ['iife'],
      fileName: () => 'deal-board.js',
    },
    outDir: 'static',
    emptyOutDir: false,
    minify: true,
  },
});
