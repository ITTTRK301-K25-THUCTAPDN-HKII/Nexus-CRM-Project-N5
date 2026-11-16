import { defineConfig } from 'vite';

// Build board React thành một file tĩnh để Flask tiếp tục phục vụ giao diện.
export default defineConfig({
  // React checks NODE_ENV at runtime; replace it during the browser bundle build.
  // Without this, the standalone Flask-served bundle throws `process is not defined`.
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
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
