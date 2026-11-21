import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, Plugin } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function collectRelativeFiles(baseDir: string, currentDir = baseDir): string[] {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectRelativeFiles(baseDir, fullPath));
    } else if (entry.isFile()) {
      const rel = path.relative(baseDir, fullPath).split(path.sep).join('/');
      if (rel === 'sw.js' || rel === '.nojekyll') continue;
      results.push(`./${rel}`);
    }
  }

  return results.sort();
}

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

      // Inject exact list of all production assets (JS, CSS, fonts, icons, HTML, manifest) into dist/sw.js
      const distSwPath = path.join(distDir, 'sw.js');
      if (fs.existsSync(distSwPath)) {
        const assetFiles = collectRelativeFiles(distDir);
        const cacheHash = crypto
          .createHash('sha1')
          .update(assetFiles.join('|'))
          .digest('hex')
          .slice(0, 10);
        const cacheVersion = `shalom-cache-${cacheHash}`;
        const precacheList = Array.from(new Set(['./', ...assetFiles]));

        let swContent = fs.readFileSync(distSwPath, 'utf8');
        swContent = swContent.replace('__SHALOM_CACHE_VERSION__', cacheVersion);
        swContent = swContent.replace(
          /\/\* __SHALOM_PRECACHE_ASSETS__ \*\/ \[[\s\S]*?\];/,
          `${JSON.stringify(precacheList, null, 2)};`
        );
        fs.writeFileSync(distSwPath, swContent, 'utf8');
      }

      // Mirror clean production output into /docs for GitHub Pages publishing
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
