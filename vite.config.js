import { defineConfig } from 'vite';

export default defineConfig({
    base: '/0319_New_TDM/',
    root: '.',
    build: {
        outDir: 'dist',
        rollupOptions: {
            input: 'index.html'
        },
        minify: 'esbuild'
    },
    server: {
        open: true,
        port: 3000
    }
});
