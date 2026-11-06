import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

const priv = process.env.PRIVATE_BUILD === '1';
export default defineConfig({
  // Used for absolute URLs in link previews (og:image must be absolute). Change if you add a custom domain.
  site: 'https://saltmarsh-photo-co.jervin5612.workers.dev',
  output: 'static',
  // private build: outputs elsewhere and inlines CSS so gallery HTML needs no public /_astro files
  outDir: priv ? './private-dist' : './dist',
  build: { inlineStylesheets: priv ? 'always' : 'auto' },
  vite: { plugins: [tailwindcss()] },
});
