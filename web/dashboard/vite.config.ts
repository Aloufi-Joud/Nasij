import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The dashboard imports the shared src/mock.ts, src/theme.ts and geo.ts from the app root
export default defineConfig({
  plugins: [react()],
  server: { fs: { allow: ['../..'] } },
});
