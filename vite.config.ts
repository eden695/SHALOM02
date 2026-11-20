import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, Plugin } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function shalomGitHubPagesSyncPlugin(): Plugin {
  return {
    name: 'shalom-github-pages-sync',
    apply: 'build',
    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist');
      const docsDir = path.resolve(__dirname, 'docs');
      if (!fs.existsSync(distDir)) return;

      const distIndex = path.join(distDir, 'index.html');
      const dist404 = path.join(distDir, '404.html');
      if (fs.existsSync(distIndex)) {
        fs.copyFileSync(distIndex, dist404);
      }

      fs.rmSync(docsDir, { recursive: true, force: true });
      fs.cpSync(distDir, docsDir, { recursive: true });
    },
  };
}

export default defineConfig(() => {
  return {
    base: './',
    define: {
      __SHALOM_APP_VERSION__: JSON.stringify('2.5.0'),
      __SHALOM_BUILD_DATE__: JSON.stringify(new Date().toISOString().split('T')[0]),
    },
    plugins: [react(), tailwindcss(), shalomGitHubPagesSyncPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
