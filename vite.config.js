import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendPort = env.PORT || 8080;
  return {
    plugins: [react()],
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.js',
      include: ['src/**/*.test.{js,jsx}'],
    },
    server: {
      host: true,
      port: 3000,
      proxy: {
        '/v1': { target: `http://127.0.0.1:${backendPort}`, changeOrigin: true },
      },
    },
  };
});
