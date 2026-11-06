import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

const priv = process.env.PRIVATE_BUILD === '1';
export default defineConfig({
  output: 'static',
  // private build: outputs elsewhere and inlines CSS so gallery HTML needs no public /_astro files
  outDir: priv ? './private-dist' : './dist',
  build: { inlineStylesheets: priv ? 'always' : 'auto' },
  vite: { plugins: [tailwindcss()] },
});
