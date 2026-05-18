import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { execSync } from 'node:child_process';

// Auto-bump patch version from git commit count, mirroring the Android
// app/build.gradle.kts pattern. Baseline 274 was the commit count when
// the 1.2.x cycle started, so the first build of this cycle shows 1.2.1.
const VERSION_BASELINE = 274;
function computeAppVersion(): string {
  let count = VERSION_BASELINE + 1;
  try {
    const out = execSync('git rev-list --count HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    const parsed = parseInt(out, 10);
    if (Number.isFinite(parsed)) count = parsed;
  } catch {
    // git not available; fall back to baseline+1 → "1.2.1"
  }
  const patch = Math.max(1, count - VERSION_BASELINE);
  return `1.2.${patch}`;
}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(computeAppVersion()),
  },
  resolve: {
    alias: {
      '@engine': path.resolve(__dirname, '../web/src'),
      '@kmp-engine': path.resolve(__dirname, '../kmp-engine/build/dist/js/productionLibrary'),
    },
  },
});
