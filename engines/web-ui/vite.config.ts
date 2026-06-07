import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readFileSync } from 'node:fs';

// App version comes from package.json, matching the Editor / Action Container /
// Action Tester convention so the whole suite versions together.
const appVersion = (
  JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')) as {
    version: string;
  }
).version;

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  resolve: {
    alias: {
      '@engine': path.resolve(__dirname, '../web/src'),
      '@kmp-engine': path.resolve(__dirname, '../kmp-engine/build/dist/js/productionLibrary'),
    },
  },
});
