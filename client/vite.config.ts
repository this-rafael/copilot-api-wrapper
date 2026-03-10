import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const workspaceRoot = path.resolve(__dirname, '..');
  const env = loadEnv(mode, workspaceRoot, '');
  const clientPort = Number(env.CLIENT_PORT || '5173');
  const clientHost = env.CLIENT_HOST || '0.0.0.0';
  const backendPort = env.VITE_BACKEND_PORT || env.PORT || '3000';
  const backendHost = env.VITE_BACKEND_HOST || '';

  return {
    envDir: '..',
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) {
              return undefined;
            }

            if (id.includes('@xterm/addon-webgl')) {
              return 'xterm-webgl';
            }

            if (id.includes('@xterm')) {
              return 'xterm';
            }

            if (id.includes('react-dom') || id.includes('react/') || id.includes('/react')) {
              return 'react-vendor';
            }

            return 'vendor';
          },
        },
      },
    },
    server: {
      host: clientHost,
      port: clientPort,
      strictPort: true,
    },
    preview: {
      host: clientHost,
      port: clientPort,
      strictPort: true,
    },
    define: {
      'import.meta.env.VITE_BACKEND_PORT': JSON.stringify(backendPort),
      'import.meta.env.VITE_BACKEND_HOST': JSON.stringify(backendHost),
    },
    test: {
      environment: 'jsdom',
      setupFiles: './tests/setup.ts',
      css: true,
    },
  };
});