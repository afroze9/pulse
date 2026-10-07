import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
export default defineConfig(({mode}) => ({ base:'./', build:{outDir:mode==='desktop'?'dist-desktop':'dist',...(mode==='desktop'?{rollupOptions:{output:{entryFileNames:'assets/entry-[hash].js',chunkFileNames:'assets/chunk-[hash].js'}}}:{})}, plugins:[svelte(), ...(mode==='desktop'?[{name:'pulse-native-host',transformIndexHtml(){return [{tag:'script',attrs:{src:'./pulse-native.js'},injectTo:'head-prepend'}];}}]:[])], server:{port:5173,proxy:{'/api':'http://127.0.0.1:5080'}} }));
