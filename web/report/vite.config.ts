import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The page imports the shared src/firebase/passerby.ts, src/mock.ts and src/theme.ts from the app root
// (Firebase itself comes from the app's node_modules, like the dashboard)
export default defineConfig({
  plugins: [react()],
  server: { fs: { allow: ['../..'] } },
});
